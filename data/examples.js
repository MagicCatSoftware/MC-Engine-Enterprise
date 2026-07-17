// Content for the /examples showcase page (server.js → examplesPageHTML()).
// Add more categories/items here in later batches — the page re-renders from this array alone.
// Target: 100 examples total across all categories.

const EXAMPLES = [
  {
    category: 'Personal & Profile',
    items: [
      { icon: '🧑‍💼', title: 'Personal portfolio / resume page', desc: 'Showcase your work and background at your own URL.' },
      { icon: '🔗', title: 'Link-in-bio page', desc: 'One central link hub for all your social profiles.' },
      { icon: '🖼️', title: 'Photo gallery with lightbox', desc: 'Loop-rendered image grid with click-to-enlarge.' },
      { icon: '💳', title: 'Digital business card', desc: 'Contact details and links in a shareable mini-page.' },
      { icon: '💍', title: 'Wedding / event RSVP page', desc: 'Collect guest responses straight into a DB collection.' },
      { icon: '📝', title: 'Personal blog with post list', desc: 'A pipe-fed loop of posts, newest first.' },
      { icon: '✈️', title: 'Travel journal with entries', desc: 'Log trips and stops as they happen.' },
      { icon: '🍳', title: 'Recipe collection', desc: 'Searchable list of recipes with ingredients and steps.' },
      { icon: '📚', title: 'Reading list tracker', desc: 'Track books read, in progress, and want-to-read.' },
      { icon: '🔥', title: 'Habit tracker with streaks', desc: 'Log daily habits and watch the streak count grow.' },
    ],
  },
  {
    category: 'Productivity & CRUD',
    items: [
      { icon: '✅', title: 'Todo list with categories', desc: 'Classic task list, grouped and filterable.' },
      { icon: '🗂️', title: 'Kanban-style task board', desc: 'Columns of cards moved through wires and events.' },
      { icon: '🗒️', title: 'Note-taking app', desc: 'Quick capture and browse of freeform notes.' },
      { icon: '📖', title: 'Guestbook / message board', desc: 'Visitors sign in with a short public message.' },
      { icon: '👤', title: 'Contact list manager', desc: 'Add, search, and browse personal contacts.' },
      { icon: '🧾', title: 'Simple CRM (leads/contacts)', desc: 'Track leads through stages with logic blocks.' },
      { icon: '📌', title: 'Project tracker', desc: 'Status board for ongoing projects and milestones.' },
      { icon: '🗓️', title: 'Meeting notes log', desc: 'One entry per meeting, searchable by date.' },
      { icon: '🔖', title: 'Bookmark manager', desc: 'Save and tag links for later.' },
      { icon: '⏱️', title: 'Time-tracking log', desc: 'Start/stop entries logged straight to the database.' },
    ],
  },
];

module.exports = EXAMPLES;
