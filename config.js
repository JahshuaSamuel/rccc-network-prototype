/* config.js: which backend this page uses. Public values only: the anon key is designed to ship
   in the browser; row-level security in the database protects the data. */
window.RCCC_CONFIG = {
  BACKEND: 'supabase',                 // 'local' | 'supabase'
  SUPABASE_URL: 'https://udnrlisexjymqousvkkn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbnJsaXNleGp5bXFvdXN2a2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNzI1ODAsImV4cCI6MjEwNzc0ODU4MH0.3x5Nz0sWvLrBvIHukaUkIFGzT76agavRh4vDwypWlLc',
  PHONE_OTP: 'screen',                 // phone codes stay on screen until Twilio is connected
  HYDRATE_LIMIT: 20000,
};
/* Demo mode: ?demo=1 runs this tab on the browser-only backend with the sample accounts.
   It never touches the real database. ?demo=0 leaves demo mode. */
(function () {
  var c = window.RCCC_CONFIG, k = 'rccc:demo', demo = false;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('demo') === '1') sessionStorage.setItem(k, '1');
    if (q.get('demo') === '0') sessionStorage.removeItem(k);
    demo = sessionStorage.getItem(k) === '1';
  } catch (e) { /* private window: no demo persistence */ }
  c.DEMO = demo;
  c.ACTIVE_BACKEND = demo ? 'local' : c.BACKEND;
})();
