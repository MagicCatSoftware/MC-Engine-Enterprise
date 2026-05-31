const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const User    = require('../models/User');
const { requireLogin } = require('../middleware/auth');

const stripe   = Stripe(process.env.STRIPE_SECRET_KEY);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PRICE_ID = process.env.STRIPE_PRICE_ID;

// Create a Stripe Checkout session for the subscription
router.post('/create-checkout', requireLogin, async (req, res, next) => {
  try {
    const user = req.user;
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items:           [{ price: PRICE_ID, quantity: 1 }],
      success_url:          BASE_URL + '/stripe/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:           BASE_URL + '/?checkout=cancelled',
    });

    res.json({ url: session.url });
  } catch (e) { next(e); }
});

// Open the Stripe customer portal (manage/cancel subscription)
router.post('/portal', requireLogin, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user.stripeCustomerId) return res.status(400).json({ error: 'No subscription found' });
    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripeCustomerId,
      return_url: BASE_URL,
    });
    res.json({ url: session.url });
  } catch (e) { next(e); }
});

// Redirect after successful checkout
router.get('/success', requireLogin, (req, res) => {
  res.redirect('/?checkout=success');
});

// Stripe webhook — raw body is applied in server.js before this handler
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe] webhook signature error:', err.message);
    return res.status(400).send('Webhook error: ' + err.message);
  }

  const obj = event.data.object;

  try {
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      await User.findOneAndUpdate(
        { stripeCustomerId: obj.customer },
        { subscriptionStatus: 'active', stripeSubscriptionId: obj.subscription }
      );
      console.log('[stripe] subscription activated for customer', obj.customer);
    }

    if (event.type === 'customer.subscription.updated') {
      const status = (obj.status === 'active' || obj.status === 'trialing') ? 'active' : obj.status;
      await User.findOneAndUpdate(
        { stripeCustomerId: obj.customer },
        { subscriptionStatus: status, stripeSubscriptionId: obj.id }
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      await User.findOneAndUpdate(
        { stripeCustomerId: obj.customer },
        { subscriptionStatus: 'canceled' }
      );
      console.log('[stripe] subscription canceled for customer', obj.customer);
    }
  } catch (err) {
    console.error('[stripe] webhook handler error:', err);
    return res.status(500).json({ error: 'Handler failed' });
  }

  res.json({ received: true });
}

module.exports = { router, handleWebhook };
