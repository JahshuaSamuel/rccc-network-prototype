/* RCCC Network Prototype — sample data (Agent 2).
   All people, businesses, news items, channels and addresses are fictional.
   Deterministic: uses a seeded mulberry32 PRNG, never random. Today = 2026-10-14. */
(function () {
  'use strict';

  // ---------- seeded helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  var FIRST = ['Maria', 'James', 'Linh', 'Robert', 'Aisha', 'Carlos', 'Mei', 'David', 'Fatima', 'Thomas',
    'Rosa', 'Anil', 'Grace', 'Miguel', 'Sarah', 'Hyun', 'Patricia', 'Oscar', 'Jennifer', 'Tuan',
    'Elaine', 'Victor', 'Leilani', 'Gregory', 'Ana', 'Rajesh', 'Catherine', 'Diego', 'Nadia', 'William',
    'Yesenia', 'Kevin', 'Teresa', 'Samir', 'Lauren', 'Arturo', 'Joyce', 'Minh', 'Brenda', 'Ernesto',
    'Helen', 'Kofi', 'Monica', 'Stanley', 'Ingrid', 'Rafael', 'Deborah', 'Wei'];
  var LAST = ['Alvarez', 'Nguyen', 'Patterson', 'Kaur', 'Mendoza', 'Chen', 'Holloway', 'Ramirez', 'Okonkwo', 'Fischer',
    'Tran', 'Castellano', 'Brennan', 'Iyer', 'Delacruz', 'Whitaker', 'Park', 'Esposito', 'Haddad', 'Lindqvist',
    'Oyelaran', 'Gutierrez', 'Sato', 'McAllister', 'Pham', 'Rosales', 'Dunleavy', 'Bhatt', 'Carrasco', 'Yamamoto',
    'Abernathy', 'Villanueva', 'Kowalski', 'Ortega', 'Sorensen', 'Mahmoud', 'Thibodeaux', 'Cruz', 'Hartley', 'Lozano'];

  // ---------- shared network news (pushed from the Master network) ----------
  var NATIONAL = [
    { id: 'nat-1', title: 'House panel advances bill to tighten reporting on federal grants', summary: 'The measure would require agencies to publish quarterly spending reports for grants above $250,000. Supporters say it gives taxpayers a clear view of where money goes; a floor vote could come after the election recess.', source: 'National Desk', minutesAgo: 95, pushed: true, locked: false, priority: 90, tag: 'Congress' },
    { id: 'nat-2', title: 'Small-business optimism edges higher in September survey', summary: 'Owners reported slightly better hiring plans, while inflation and labor costs remain their top concerns. Retail and construction firms showed the largest gains.', source: 'National Desk', minutesAgo: 210, pushed: true, locked: false, priority: 80, tag: 'Economy' },
    { id: 'nat-3', title: 'Parents rank math recovery as top school priority, new poll finds', summary: 'A national survey of 3,000 parents put math and reading recovery ahead of facilities and technology. Most respondents favored publishing school-level test results each year.', source: 'Capitol Brief', minutesAgo: 380, pushed: true, locked: false, priority: 80, tag: 'Education' },
    { id: 'nat-4', title: 'Bipartisan group proposes faster permitting for water storage projects', summary: 'The proposal sets a two-year review clock for reservoirs and groundwater recharge projects. Western farm groups and several water agencies have endorsed the framework.', source: 'National Desk', minutesAgo: 520, pushed: true, locked: false, priority: 75, tag: 'Water' },
    { id: 'nat-5', title: 'Election officials outline chain-of-custody steps for mail ballots', summary: 'A national association of election administrators released a checklist covering drop-box collection, signature review and observer access. Party observers are encouraged to request their county procedures in writing.', source: 'Capitol Brief', minutesAgo: 760, pushed: true, locked: false, priority: 85, tag: 'Elections' },
    { id: 'nat-6', title: 'Diesel prices climb ahead of harvest and holiday shipping season', summary: 'Truckers and farmers face higher fuel costs as refinery maintenance tightens supply. Analysts expect prices to ease in early winter.', source: 'National Desk', minutesAgo: 1240, pushed: true, locked: false, priority: 70, tag: 'Energy' }
  ];
  var STATE = [
    { id: 'st-1', title: 'Mail ballots are arriving: return by Nov 3 or postmark by Election Day', summary: 'Every registered California voter receives a mail ballot. Completed ballots can go in an official drop box, to a vote center, or in the mail postmarked by November 3 and received within seven days.', source: 'Golden State Wire', minutesAgo: 60, pushed: true, locked: false, priority: 100, tag: 'Elections' },
    { id: 'st-2', title: 'Missed the Oct 19 deadline? Same-day registration is available at vote centers', summary: 'Eligible Californians who miss the regular deadline can still register and cast a provisional ballot at a county vote center or elections office through Election Day.', source: 'Golden State Wire', minutesAgo: 180, pushed: true, locked: false, priority: 95, tag: 'Elections' },
    { id: 'st-3', title: 'Lawmakers weigh pause on next scheduled gas tax increase', summary: 'A bipartisan group of legislators wants to delay the annual inflation adjustment to the state excise tax. Drivers currently pay one of the highest per-gallon rates in the nation.', source: 'Capitol Report', minutesAgo: 340, pushed: true, locked: false, priority: 85, tag: 'Gas Tax' },
    { id: 'st-4', title: 'Homeowners in fire-prone areas report trouble renewing insurance', summary: 'A state survey found renewal notices and premium increases rising across foothill communities. Regulators are reviewing new rules meant to bring insurers back into the market.', source: 'Capitol Report', minutesAgo: 610, pushed: true, locked: false, priority: 75, tag: 'Insurance' },
    { id: 'st-5', title: 'Housing production falls short of state targets for a third year', summary: 'New permits trailed goals in most regions. Builders point to permitting timelines and fees; several cities are testing faster over-the-counter approvals.', source: 'Golden State Wire', minutesAgo: 900, pushed: true, locked: false, priority: 70, tag: 'Housing' },
    { id: 'st-6', title: 'Retail theft task force reports first-year results', summary: 'The statewide task force reported hundreds of arrests and recovered merchandise across major metro areas. Retailers want the program funded beyond its pilot period.', source: 'Capitol Report', minutesAgo: 1420, pushed: true, locked: false, priority: 70, tag: 'Public Safety' }
  ];
  var BREAKING = { id: 'brk-voter-reg', title: 'Voter registration closes Monday, Oct 19 — check your status', summary: 'Confirm your registration and mailing address before the Monday, October 19 deadline. It takes two minutes and makes sure your ballot reaches you.', source: 'Network Alert Desk', minutesAgo: 25, pushed: true, locked: true, priority: 120, tag: 'Alert' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- tenant builder ----------
  function buildTenant(cfg) {
    var rng = mulberry32(cfg.seed);

    // members
    var members = [];
    cfg.exec.forEach(function (e, i) {
      members.push({ id: cfg.slug + '-m' + (members.length + 1), name: e[0], role: 'EXEC_BOARD', title: e[1], district: e[2], seated: true, weight: 1 });
    });
    cfg.committee.forEach(function (c) {
      members.push({ id: cfg.slug + '-m' + (members.length + 1), name: c[0], role: 'COMMITTEE_MEMBER', title: 'Committee Member', district: c[1], seated: true, weight: 1 });
    });
    cfg.alternates.forEach(function (a, i) {
      members.push({ id: cfg.slug + '-m' + (members.length + 1), name: a[0], role: 'ALTERNATE', title: 'Alternate', district: a[1], seated: i === 0, weight: i < 2 ? 0.5 : 1 });
    });
    cfg.memberVolunteers.forEach(function (v) {
      members.push({ id: cfg.slug + '-m' + (members.length + 1), name: v[0], role: 'VOLUNTEER', title: v[1], district: v[2], seated: false, weight: 1 });
    });

    // volunteers + turfs
    var volunteers = cfg.volunteers.map(function (v, i) {
      return { id: cfg.slug + '-v' + (i + 1), name: v[0], doors: v[1], shifts: v[2] };
    });
    var turfs = cfg.turfs.map(function (t, i) {
      return { id: cfg.slug + '-t' + (i + 1), name: t.name, precincts: t.precincts, color: t.color, doors: t.doors, done: volunteers[i].doors, volunteerId: volunteers[i].id };
    });

    // voters: 20 per turf, exact party mix 46 REP / 36 NPP / 32 DEM / 6 OTHER
    var parties = [];
    [['REP', 46], ['NPP', 36], ['DEM', 32], ['OTHER', 6]].forEach(function (p) { for (var k = 0; k < p[1]; k++) parties.push(p[0]); });
    parties = shuffle(rng, parties);
    var voters = [];
    var usedNames = {};
    cfg.turfs.forEach(function (t, ti) {
      // each turf has 2–3 streets; houses sit along them
      for (var k = 0; k < 20; k++) {
        var first, last, key;
        do { first = pick(rng, FIRST); last = pick(rng, LAST); key = first + ' ' + last; } while (usedNames[key]);
        usedNames[key] = 1;
        var street = t.streets[k % t.streets.length];
        var num = 100 + Math.floor(rng() * 89) * 10 + (k % 2 ? 1 : 4);
        var ang = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * 0.075;
        var idx = voters.length;
        voters.push({
          id: cfg.slug + '-vt' + String(idx + 1).padStart(3, '0'),
          first: first, last: last,
          address: num + ' ' + street,
          city: t.city,
          precinct: t.precincts[k % t.precincts.length],
          party: parties[idx],
          propensity: 10 + Math.floor(rng() * 89),
          turfId: turfs[ti].id,
          x: round3(clamp(t.cx + Math.cos(ang) * rad, 0.05, 0.95)),
          y: round3(clamp(t.cy + Math.sin(ang) * rad * 0.9, 0.05, 0.95))
        });
      }
    });

    // candidates
    var candidates = cfg.candidates.map(function (c, i) {
      var cand = {
        id: cfg.slug + '-c' + (i + 1), name: c.name, office: c.office, district: c.district,
        electionDate: c.electionDate || '2026-11-03', status: c.status, slogan: c.slogan, bio: c.bio, issues: c.issues,
        committeeName: c.committeeName, fppcId: c.fppcId, disclaimer: '',
        raisedUsd: c.raisedUsd, goalUsd: c.goalUsd, subdomain: c.subdomain, siteStatus: c.siteStatus,
        photo: c.photo || null, photoPos: c.photoPos || '50% 25%'
      };
      cand.disclaimer = c.missingDisclaimer ? '' : 'Paid for by ' + c.committeeName + ', FPPC #' + c.fppcId;
      return cand;
    });
    var endorsee = candidates.filter(function (c) { return c.status === 'FILED'; })[0];

    var t = {
      slug: cfg.slug, name: cfg.name, shortName: cfg.shortName, domain: cfg.domain, county: cfg.county, state: 'CA', region: cfg.region,
      colors: cfg.colors,
      tagline: cfg.tagline,
      chair: { name: cfg.exec[0][0], title: cfg.exec[0][1] },
      members: members,
      news: { national: clone(NATIONAL).filter(function (n) { return cfg.hiddenNews.indexOf(n.id) < 0; }), state: clone(STATE), county: cfg.countyNews, city: cfg.cityNews },
      breaking: clone(BREAKING),
      videos: cfg.videos,
      localAds: cfg.localAds,
      events: cfg.events,
      candidates: candidates,
      turfs: turfs,
      voters: voters,
      volunteers: volunteers,
      meeting: {
        id: cfg.slug + '-mtg-2026-10', title: 'October General Meeting', date: '2026-10-20', time: '7:00 PM', provider: 'Zoom',
        quorumRule: 'majority of seated members',
        agenda: [
          'Call to order and roll call',
          'Approve minutes of the September General Meeting',
          'Endorsement: ' + endorsee.name + ' (' + endorsee.office + ', ' + endorsee.district + ')',
          'Approve election-night budget',
          'Bylaws amendment: allow remote attendance at standing committees'
        ]
      },
      ballots: [
        { id: cfg.slug + '-b1', title: 'Endorsement: ' + endorsee.name + ' for ' + endorsee.office + ', ' + endorsee.district, type: 'SECRET',
          options: [{ id: 'yes', label: 'Endorse' }, { id: 'no', label: 'Do not endorse' }, { id: 'abstain', label: 'Abstain' }],
          threshold: 66.67, status: 'open', tally: cfg.tallies.endorse },
        { id: cfg.slug + '-b2', title: 'Approve election-night budget (' + cfg.electionNightBudget + ')', type: 'ROLL_CALL',
          options: [{ id: 'aye', label: 'Aye' }, { id: 'nay', label: 'Nay' }, { id: 'abstain', label: 'Abstain' }],
          threshold: 50, status: 'closed', tally: cfg.tallies.budget },
        { id: cfg.slug + '-b3', title: 'Bylaws amendment: allow remote attendance at standing committees', type: 'WEIGHTED',
          options: [{ id: 'yes', label: 'Adopt amendment' }, { id: 'no', label: 'Reject amendment' }],
          threshold: 66.67, status: 'open', tally: cfg.tallies.bylaws }
      ],
      proxies: cfg.proxies.map(function (p) { return { grantor: p[0], holder: p[1], verified: p[2] }; }),
      stats: cfg.stats
    };
    return t;
  }

  // ======================= SVGOP =======================
  var svgop = buildTenant({
    seed: 240117, slug: 'svgop', name: 'Santa Clara County Republican Party', shortName: 'SVGOP', domain: 'svgop.com',
    county: 'Santa Clara', region: 'bay-area',
    colors: { brand: '#0B2A4A', brandInk: '#FFFFFF', accent: '#C8102E' },
    tagline: 'Silicon Valley Republicans working for safe streets and a valley that families can afford.',
    exec: [
      ['Margaret Okafor-Lind', 'Chair', 'Assembly District 26'],
      ['Victor Castellanos', 'Vice Chair', 'Assembly District 28'],
      ['Diane Tsai', 'Secretary', 'Assembly District 24'],
      ['Harold Brennan', 'Treasurer', 'Assembly District 25']
    ],
    committee: [
      ['Rosalind Achebe', 'Assembly District 23'], ['Frank Delgado', 'Assembly District 23'], ['Sunita Raman', 'Assembly District 24'],
      ['Peter Vukovich', 'Assembly District 24'], ['Lourdes Ibarra', 'Assembly District 25'], ['Gordon Ashby', 'Assembly District 25'],
      ['Kim-Ly Pham', 'Assembly District 25'], ['Thomas Reinholt', 'Assembly District 26'], ['Adaeze Nwosu', 'Assembly District 26'],
      ['Carl Jeffries', 'Assembly District 26'], ['Esther Marquez', 'Assembly District 26'], ['Bryan Kowalczyk', 'Assembly District 28'],
      ['Hana Sorensen', 'Assembly District 28'], ['Raymond Cho', 'Assembly District 28'], ['Gloria Fuentes', 'Assembly District 28'],
      ['Ian Mackenzie', 'Assembly District 23'], ['Priscilla Hadley', 'Assembly District 24'], ['Omar Haddad', 'Assembly District 25'],
      ['Renee Castillo', 'Assembly District 26'], ['Stuart Lindgren', 'Assembly District 28']
    ],
    alternates: [
      ['Marisol Beltran', 'Assembly District 25'], ['Neil Prakash', 'Assembly District 26'],
      ['Darlene Fowler', 'Assembly District 23'], ['Jun Watanabe', 'Assembly District 28']
    ],
    memberVolunteers: [
      ['Tessa Romero', 'Precinct Captain', 'Assembly District 26'],
      ['Arjun Mehta', 'Phone Bank Lead', 'Assembly District 24'],
      ['Colleen Doherty', 'Data Volunteer', 'Assembly District 28']
    ],
    volunteers: [
      ['Tessa Romero', 142, 9], ['Arjun Mehta', 97, 7], ['Colleen Doherty', 188, 11],
      ['Benjamin Osei', 64, 4], ['Lucia Navarro', 121, 8], ['Grant Whitfield', 83, 6],
      ['Ming Zhao', 54, 5], ['Dolores Vance', 38, 3]
    ],
    turfs: [
      { name: 'Milpitas Hillside', city: 'Milpitas', precincts: ['2401', '2403'], color: '#2563EB', doors: 220, cx: 0.78, cy: 0.17, streets: ['Quarry Ridge Ct', 'Sycamore Bend Dr', 'Larkhaven Way'] },
      { name: 'Sunnyvale Lakewood', city: 'Sunnyvale', precincts: ['2408', '2411'], color: '#16A34A', doors: 180, cx: 0.32, cy: 0.16, streets: ['Bellwether Ave', 'Corliss Lane', 'Juniper Shoals Dr'] },
      { name: 'Cupertino Foothills', city: 'Cupertino', precincts: ['2417', '2418'], color: '#D97706', doors: 240, cx: 0.17, cy: 0.44, streets: ['Ridgemont Hollow Rd', 'Talbrook Ct', 'Vista Arden Way'] },
      { name: 'Willow Glen West', city: 'San Jose', precincts: ['2422', '2425'], color: '#9333EA', doors: 160, cx: 0.56, cy: 0.46, streets: ['Linden Corral St', 'Hazelmere Ave', 'Pomeroy Glen Ct'] },
      { name: 'Campbell Downtown', city: 'Campbell', precincts: ['2431', '2433'], color: '#DC2626', doors: 200, cx: 0.4, cy: 0.66, streets: ['Orchard Rest Ln', 'Wexley Ave', 'Calloway Park Dr'] },
      { name: 'Morgan Hill Central', city: 'Morgan Hill', precincts: ['2446', '2449'], color: '#0891B2', doors: 190, cx: 0.75, cy: 0.84, streets: ['Tamsin Oak Dr', 'Branford Creek Rd', 'Monterra Vale Ct'] }
    ],
    candidates: [
      { name: 'Elena Marsh', office: 'School Board Trustee', district: 'Trustee Area 3', status: 'ENDORSED',
        slogan: 'Open books, and every child reading by third grade.',
        bio: 'Elena Marsh is a Sunnyvale mother of three and a former payroll manager who has volunteered in local classrooms for nine years. She led the parent committee that pushed the district to publish its budget line by line online.',
        issues: ['Reading and math proficiency first', 'Transparent, balanced district budgets', 'Parents as partners in curriculum decisions'],
        committeeName: 'Elena Marsh for School Board 2026', fppcId: '1467235', raisedUsd: 24800, goalUsd: 35000, subdomain: 'elenamarsh.svgop.com', siteStatus: 'LIVE', photo: 'images/photo-1.jpg', photoPos: '50% 22%' },
      { name: 'Raymond Kessler', office: 'City Council', district: 'District 6', status: 'ACTIVE_CAMPAIGN', missingDisclaimer: true,
        slogan: 'Safe streets and a city hall that answers the phone.',
        bio: 'Raymond Kessler is a San Jose small-business owner who has run a family auto repair shop for 18 years. He served on his neighborhood association board and organized a volunteer graffiti-removal crew that now covers 40 blocks.',
        issues: ['Fully staffed police and faster 911 response', 'Road repair before new pet projects', 'Faster permits for small businesses'],
        committeeName: 'Raymond Kessler for City Council 2026', fppcId: '1471862', raisedUsd: 71400, goalUsd: 90000, subdomain: 'raymondkessler.svgop.com', siteStatus: 'LIVE', photo: 'images/photo-2.jpg', photoPos: '50% 22%' },
      { name: 'Priya Venkataraman', office: 'Water District Director', district: 'Division 2', status: 'FILED',
        slogan: 'Reliable water at a fair price.',
        bio: 'Priya Venkataraman is a civil engineer from Cupertino with 15 years of experience in water infrastructure and project finance. She wants every rate increase tied to a published list of the projects it pays for.',
        issues: ['Rate increases tied to published project lists', 'More local water storage and recharge', 'Independent audits of capital spending'],
        committeeName: 'Priya Venkataraman for Water Board 2026', fppcId: '1483019', raisedUsd: 12600, goalUsd: 40000, subdomain: 'priyavenkataraman.svgop.com', siteStatus: 'BUILDING', photo: 'images/photo-3.jpg', photoPos: '50% 24%' },
      { name: 'Daniel Whitcomb', office: 'County Board of Education', district: 'Trustee Area 5', status: 'RECRUITED', electionDate: '2028-03-07',
        slogan: 'Strong schools start with strong standards.',
        bio: 'Daniel Whitcomb is a retired Morgan Hill high school chemistry teacher and Navy veteran. After 31 years in the classroom he is running to bring a teacher’s practical eye to county education spending.',
        issues: ['Career and technical education pathways', 'Measurable standards for charter renewals', 'Classroom dollars ahead of administration'],
        committeeName: 'Daniel Whitcomb for County Board of Education 2028', fppcId: '1502746', raisedUsd: 8200, goalUsd: 30000, subdomain: 'danielwhitcomb.svgop.com', siteStatus: 'QUEUED', photo: 'images/photo-4.jpg', photoPos: '56% 36%' },
      { name: 'Marcus Adeyemi', office: 'Community College Trustee', district: 'Trustee Area 5', status: 'ENDORSED',
        slogan: 'Skills that lead to paychecks.',
        bio: 'Marcus Adeyemi is a Milpitas network engineer who started at a community college before finishing his degree. He mentors apprentices in a local tech-trades program and wants every certificate tied to a real job.',
        issues: ['Certificates built with local employers', 'Transparent, balanced district budgets', 'Safe, well-lit campuses for evening students'],
        committeeName: 'Marcus Adeyemi for College Trustee 2026', fppcId: '1486254', raisedUsd: 19700, goalUsd: 32000, subdomain: 'marcusadeyemi.svgop.com', siteStatus: 'LIVE', photo: 'images/photo-5.jpg', photoPos: '56% 30%' }
    ],
    electionNightBudget: '$4,800',
    tallies: {
      endorse: { yes: 12, no: 3, abstain: 1 },        // 16 of 25 seated have voted
      budget: { aye: 19, nay: 3, abstain: 1 },
      bylaws: { yes: 11.5, no: 4 }
    },
    proxies: [
      ['Gordon Ashby', 'Lourdes Ibarra', true],
      ['Hana Sorensen', 'Victor Castellanos', true],
      ['Carl Jeffries', 'Thomas Reinholt', false]
    ],
    hiddenNews: [],
    countyNews: [
      { id: 'svgop-co-1', title: 'Registrar seeks 1,200 more poll workers for Nov 3; bilingual volunteers needed', summary: 'The county Registrar of Voters is recruiting election workers for vote centers, with paid training sessions this week. Spanish, Vietnamese, Chinese and Tagalog speakers are especially needed.', source: 'Valley Ledger', minutesAgo: 140, pushed: false, locked: false, priority: 60, tag: 'Elections' },
      { id: 'svgop-co-2', title: 'Water district proposes 9% rate increase; public hearing set for Nov 12', summary: 'District staff say the increase funds pipeline replacement and a dam retrofit. Residents can comment in writing or in person at the November hearing.', source: 'South Bay Today', minutesAgo: 320, pushed: false, locked: false, priority: 55, tag: 'Water' },
      { id: 'svgop-co-3', title: 'County budget hearing draws questions on overtime spending', summary: 'Supervisors asked staff for a department-by-department overtime report after costs ran 14% over plan last fiscal year. The report is due in December.', source: 'Valley Ledger', minutesAgo: 600, pushed: false, locked: false, priority: 50, tag: 'Budget' },
      { id: 'svgop-co-4', title: 'Sheriff’s office expands evening patrols in unincorporated neighborhoods', summary: 'Two additional evening patrol units start in November, funded by savings from a vacant administrative position. Residents can sign up for the community alert list.', source: 'South Bay Today', minutesAgo: 1100, pushed: false, locked: false, priority: 50, tag: 'Public Safety' },
      { id: 'svgop-co-5', title: 'Supervisors to review audit of homeless services contracts', summary: 'An outside audit found incomplete outcome reporting on several contracts. The board will hear recommendations on performance measures at its next meeting.', source: 'Valley Ledger', minutesAgo: 1680, pushed: false, locked: false, priority: 50, tag: 'Accountability' },
      { id: 'svgop-co-6', title: 'SVGOP sets Lincoln Day Dinner for February 20 in San Jose', summary: 'Tickets and sponsorships open November 9. Proceeds fund candidate recruitment and precinct training for the 2028 cycle.', source: 'SVGOP', minutesAgo: 2900, pushed: false, locked: false, priority: 45, tag: 'Party' }
    ],
    cityNews: [
      { id: 'svgop-ci-1', title: 'San Jose council debates police staffing in mid-year budget', summary: 'Council members weighed adding two academy classes against other spending requests. A final vote is expected in early December.', source: 'South Bay Today', minutesAgo: 230, pushed: false, locked: false, priority: 50, tag: 'San Jose' },
      { id: 'svgop-ci-2', title: 'Sunnyvale school district faces $6.2 million shortfall', summary: 'The board is reviewing options including a hiring freeze and consolidating two administrative offices. Parents can submit comments before the October 29 meeting.', source: 'Valley Ledger', minutesAgo: 470, pushed: false, locked: false, priority: 50, tag: 'Sunnyvale' },
      { id: 'svgop-ci-3', title: 'Cupertino residents pack meeting on housing element rezoning', summary: 'More than 200 residents attended a study session on proposed rezoning near the city’s main corridor. Planning staff will return with revised traffic estimates.', source: 'South Bay Today', minutesAgo: 980, pushed: false, locked: false, priority: 45, tag: 'Cupertino' },
      { id: 'svgop-ci-4', title: 'Milpitas approves road resurfacing plan for 14 streets', summary: 'Work begins in spring and is funded by existing road maintenance dollars. A map of affected streets is posted on the city website.', source: 'Valley Ledger', minutesAgo: 1350, pushed: false, locked: false, priority: 45, tag: 'Milpitas' },
      { id: 'svgop-ci-5', title: 'Campbell weighs new downtown parking fees', summary: 'Merchants asked the council to keep the first two hours free. The council will revisit the proposal after a parking count in November.', source: 'South Bay Today', minutesAgo: 2100, pushed: false, locked: false, priority: 40, tag: 'Campbell' },
      { id: 'svgop-ci-6', title: 'Gilroy farmers market extends season through November', summary: 'Local growers will stay through Thanksgiving week thanks to strong attendance. The market runs Saturdays downtown.', source: 'Valley Ledger', minutesAgo: 3300, pushed: false, locked: false, priority: 35, tag: 'Gilroy' }
    ],
    videos: [
      { id: 'svgop-vid-1', channel: 'Liberty Hour', title: 'Mail ballots 101: return, track and confirm your vote', duration: '12:41', views: 18420, pushed: true },
      { id: 'svgop-vid-2', channel: 'The Precinct Report', title: 'Twenty days out: what a strong final canvass looks like', duration: '9:08', views: 11260, pushed: true },
      { id: 'svgop-vid-3', channel: 'Capitol Brief', title: 'The gas tax adjustment explained in five minutes', duration: '5:12', views: 23905, pushed: true },
      { id: 'svgop-vid-4', channel: 'Main Street Minute', title: 'Small business owners on permits, fees and staying open', duration: '7:36', views: 8740, pushed: true },
      { id: 'svgop-vid-5', channel: 'SVGOP Live', title: 'Meet Raymond Kessler, candidate for San Jose City Council District 6', duration: '14:02', views: 2310, pushed: false },
      { id: 'svgop-vid-6', channel: 'SVGOP Live', title: 'Precinct captain training: walk lists on your phone', duration: '18:27', views: 1185, pushed: false }
    ],
    localAds: [
      { id: 'svgop-ad-1', placement: 'SIDEBAR_TOP', title: 'Lincoln Day Dinner 2027: sponsorships now open', sponsor: 'SVGOP Finance Committee', cta: 'Become a sponsor' },
      { id: 'svgop-ad-2', placement: 'IN_FEED', title: 'Family-owned since 1987 and proud to back local volunteers.', sponsor: 'Copperline Hardware & Garden', cta: 'Visit the store' },
      { id: 'svgop-ad-3', placement: 'FOOTER_BANNER', title: 'Candidate Forum: Water District and School Board races, Oct 22', sponsor: 'SVGOP Candidate Committee', cta: 'Reserve a seat' }
    ],
    events: [
      { id: 'svgop-ev-1', title: 'Weekend Phone Bank: Get Out the Vote', date: '2026-10-17', time: '10:00 AM', location: 'SVGOP Headquarters, 2150 Lafferty Park Blvd, San Jose', rsvps: 38, kind: 'Phone bank' },
      { id: 'svgop-ev-2', title: 'Candidate Forum: Water District and School Board', date: '2026-10-22', time: '6:30 PM', location: 'Orchard Commons Hall, Campbell', rsvps: 112, kind: 'Forum' },
      { id: 'svgop-ev-3', title: 'Final Weekend Canvass Launch', date: '2026-10-31', time: '9:00 AM', location: 'Lakewood Square parking lot, Sunnyvale', rsvps: 64, kind: 'Canvass' },
      { id: 'svgop-ev-4', title: 'Election Night Watch Party', date: '2026-11-03', time: '7:30 PM', location: 'The Granary Room, 488 Vellmont St, San Jose', rsvps: 186, kind: 'Watch party' },
      { id: 'svgop-ev-5', title: 'Lincoln Day Dinner 2027', date: '2027-02-20', time: '6:00 PM', location: 'Grand Ballroom, Silver Creek Conference Center, San Jose', rsvps: 74, kind: 'Lincoln Day Dinner' }
    ],
    stats: { visitors7d: 6840, newsletter: 4215, volunteers: 312, donationsUsd: 48750 }
  });

  // ======================= DEMO =======================
  var demo = buildTenant({
    seed: 551903, slug: 'demo', name: 'Demo County Republican Party', shortName: 'Demo County GOP', domain: 'democountygop.org',
    county: 'Demo', region: 'central-valley',
    colors: { brand: '#14532D', brandInk: '#FFFFFF', accent: '#B7791F' },
    tagline: 'Demo County Republicans organizing precinct by precinct, from farm towns to main streets.',
    exec: [
      ['Walter Hendricks', 'Chair', 'Assembly District 31'],
      ['Isabel Cardenas', 'Vice Chair', 'Assembly District 32'],
      ['June Akiyama', 'Secretary', 'Assembly District 31'],
      ['Leonard Pruitt', 'Treasurer', 'Assembly District 32']
    ],
    committee: [
      ['Beverly Dawson', 'Assembly District 31'], ['Hector Valdivia', 'Assembly District 31'], ['Naomi Fairbanks', 'Assembly District 31'],
      ['Curtis Bellamy', 'Assembly District 31'], ['Anh Le', 'Assembly District 31'], ['Ruth Gallagher', 'Assembly District 31'],
      ['Emmanuel Adeyemi', 'Assembly District 31'], ['Sharon McBride', 'Assembly District 31'], ['Jesse Contreras', 'Assembly District 31'],
      ['Lorraine Pike', 'Assembly District 31'], ['Douglas Ferreira', 'Assembly District 32'], ['Amrit Sandhu', 'Assembly District 32'],
      ['Carolyn Mayfield', 'Assembly District 32'], ['Roberto Espinoza', 'Assembly District 32'], ['Pauline Strand', 'Assembly District 32'],
      ['Gary Tolliver', 'Assembly District 32'], ['Yolanda Reyes', 'Assembly District 32'], ['Martin Oduya', 'Assembly District 32'],
      ['Kristen Vogel', 'Assembly District 32'], ['Felipe Aranda', 'Assembly District 32']
    ],
    alternates: [
      ['Janet Kirkwood', 'Assembly District 31'], ['Manuel Serrano', 'Assembly District 32'],
      ['Eileen Ross', 'Assembly District 31'], ['Harpreet Gill', 'Assembly District 32']
    ],
    memberVolunteers: [
      ['Dale Overstreet', 'Precinct Captain', 'Assembly District 31'],
      ['Marisa Ocampo', 'Phone Bank Lead', 'Assembly District 32'],
      ['Trevor Lindell', 'Yard Sign Coordinator', 'Assembly District 31']
    ],
    volunteers: [
      ['Dale Overstreet', 131, 8], ['Marisa Ocampo', 76, 6], ['Trevor Lindell', 109, 7],
      ['Abigail Yoder', 58, 4], ['Ramon Ibarra', 92, 6], ['Simone Achterberg', 44, 3],
      ['Fernando Lucero', 37, 3], ['Nkechi Obi', 29, 2]
    ],
    turfs: [
      { name: 'Riverbend North', city: 'Riverbend', precincts: ['3102', '3104'], color: '#2563EB', doors: 170, cx: 0.3, cy: 0.2, streets: ['Levee Crest Rd', 'Alder Mill Ln', 'Carraway Ct'] },
      { name: 'Riverbend South', city: 'Riverbend', precincts: ['3107', '3109'], color: '#16A34A', doors: 150, cx: 0.36, cy: 0.42, streets: ['Ferry Landing Dr', 'Quillan Ave', 'Sumner Grove St'] },
      { name: 'Oak Hollow', city: 'Oak Hollow', precincts: ['3115', '3116'], color: '#D97706', doors: 190, cx: 0.74, cy: 0.22, streets: ['Acorn Bluff Rd', 'Hollister Gap Ln', 'Wrenfield Ct'] },
      { name: 'Cedar Flats', city: 'Cedar Flats', precincts: ['3121', '3124'], color: '#9333EA', doors: 140, cx: 0.7, cy: 0.55, streets: ['Tule Bank Rd', 'Granary Row', 'Pellham Ave'] },
      { name: 'Millbrook East', city: 'Millbrook', precincts: ['3130', '3132'], color: '#DC2626', doors: 160, cx: 0.55, cy: 0.82, streets: ['Spillway Dr', 'Harrow Field Ln', 'Bexley Mill Ct'] },
      { name: 'Millbrook West', city: 'Millbrook', precincts: ['3135', '3137'], color: '#0891B2', doors: 130, cx: 0.22, cy: 0.74, streets: ['Cottonwood Reach Rd', 'Tamberly Ave', 'Ashcombe St'] }
    ],
    candidates: [
      { name: 'Grace Thornbury', office: 'School Board Trustee', district: 'Trustee Area 2', status: 'ACTIVE_CAMPAIGN',
        slogan: 'Classrooms first, paperwork last.',
        bio: 'Grace Thornbury is a Riverbend dental office manager and mother of two who has coached youth softball for a decade. She wants district reports written so any parent can read them in ten minutes.',
        issues: ['Proficiency gains in reading and math', 'Plain-language budget reports for parents', 'Agriculture and trade pathways in high school'],
        committeeName: 'Grace Thornbury for School Board 2026', fppcId: '1474418', raisedUsd: 31500, goalUsd: 45000, subdomain: 'gracethornbury.democountygop.org', siteStatus: 'LIVE', photo: 'images/photo-1.jpg', photoPos: '50% 22%' },
      { name: 'Luis Arredondo', office: 'City Council', district: 'District 4', status: 'ENDORSED', missingDisclaimer: true,
        slogan: 'Riverbend works when Main Street works.',
        bio: 'Luis Arredondo runs a third-generation tire and alignment shop in Riverbend and chairs the downtown merchants association. He led the effort to reopen the Ferry Landing bridge after flood repairs ran a year late.',
        issues: ['Faster business licensing and permits', 'Flood-control maintenance on schedule', 'Neighborhood policing and code enforcement'],
        committeeName: 'Luis Arredondo for City Council 2026', fppcId: '1479350', raisedUsd: 18900, goalUsd: 28000, subdomain: 'luisarredondo.democountygop.org', siteStatus: 'LIVE', photo: 'images/photo-2.jpg', photoPos: '50% 22%' },
      { name: 'Theodore Mensah', office: 'Water District Director', district: 'Division 1', status: 'FILED',
        slogan: 'Water our farms and families can count on.',
        bio: 'Theodore Mensah is an Oak Hollow almond grower and former irrigation district engineer. He has spent 20 years managing groundwater recharge and wants every farmer to see where their assessment dollars go.',
        issues: ['Groundwater recharge and new storage', 'Stable, predictable rates for growers', 'Online posting of every capital contract'],
        committeeName: 'Theodore Mensah for Water District 2026', fppcId: '1488627', raisedUsd: 9400, goalUsd: 22000, subdomain: 'theodoremensah.democountygop.org', siteStatus: 'BUILDING', photo: 'images/photo-5.jpg', photoPos: '56% 30%' },
      { name: 'Anjali Mehra', office: 'County Board of Education', district: 'Trustee Area 4', status: 'RECRUITED', electionDate: '2028-03-07',
        slogan: 'Every student ready for a job or for college.',
        bio: 'Anjali Mehra is a Cedar Flats credit union branch manager and the first in her family to graduate from college. She mentors high school students through a financial literacy program she founded in 2019.',
        issues: ['Financial literacy in every high school', 'Accountability for county office spending', 'Expanded career technical education'],
        committeeName: 'Anjali Mehra for County Board of Education 2028', fppcId: '1505183', raisedUsd: 8000, goalUsd: 25000, subdomain: 'anjalimehra.democountygop.org', siteStatus: 'QUEUED', photo: 'images/photo-3.jpg', photoPos: '50% 24%' },
      { name: 'Mark Callaway', office: 'County Supervisor', district: 'District 3', status: 'ENDORSED',
        slogan: 'Safe roads and county books anyone can read.',
        bio: 'Mark Callaway owns a Millbrook construction supply business and has served two terms on the county planning commission. He coaches high school rugby and wants every county project posted online with its budget and timeline.',
        issues: ['Repair rural roads on a published schedule', 'Balanced budgets with a real rainy-day reserve', 'Faster permits for homes and small businesses'],
        committeeName: 'Mark Callaway for Supervisor 2026', fppcId: '1491736', raisedUsd: 52300, goalUsd: 85000, subdomain: 'markcallaway.democountygop.org', siteStatus: 'LIVE', photo: 'images/photo-4.jpg', photoPos: '56% 36%' }
    ],
    electionNightBudget: '$2,600',
    tallies: {
      endorse: { yes: 10, no: 2, abstain: 2 },        // 14 of 25 seated have voted
      budget: { aye: 18, nay: 4, abstain: 0 },
      bylaws: { yes: 9.5, no: 5 }
    },
    proxies: [
      ['Curtis Bellamy', 'Beverly Dawson', true],
      ['Pauline Strand', 'Isabel Cardenas', true],
      ['Gary Tolliver', 'Roberto Espinoza', false]
    ],
    hiddenNews: ['nat-1'],   // Demo County hid this network article (see network.pushes p3)
    countyNews: [
      { id: 'demo-co-1', title: 'Elections office opens three new ballot drop boxes in rural precincts', summary: 'New boxes in Cedar Flats, Oak Hollow and the Millbrook library cut the average drive to a drop box by 12 minutes. All boxes are emptied daily by two-person teams.', source: 'Demo County Courier', minutesAgo: 120, pushed: false, locked: false, priority: 60, tag: 'Elections' },
      { id: 'demo-co-2', title: 'Irrigation district proposes 7% assessment increase for canal lining', summary: 'Growers will see the proposal at a December hearing. The district says lining saves enough water each year to irrigate about 1,400 acres.', source: 'Valley Ledger', minutesAgo: 410, pushed: false, locked: false, priority: 55, tag: 'Water' },
      { id: 'demo-co-3', title: 'Supervisors approve two new deputy positions for rural patrol', summary: 'The positions cover the county’s eastern farm roads, where response times average 22 minutes. Funding comes from a one-time reserve transfer.', source: 'Demo County Courier', minutesAgo: 720, pushed: false, locked: false, priority: 50, tag: 'Public Safety' },
      { id: 'demo-co-4', title: 'County schools report attendance rebound but math scores lag', summary: 'Chronic absenteeism fell four points, while math proficiency stayed flat. The county office plans a tutoring pilot in six schools.', source: 'Valley Ledger', minutesAgo: 1260, pushed: false, locked: false, priority: 50, tag: 'Education' },
      { id: 'demo-co-5', title: 'Elections office recruiting poll workers for Nov 3', summary: 'Paid shifts are available at all 18 vote centers. Training sessions run through October 28.', source: 'Demo County Courier', minutesAgo: 1900, pushed: false, locked: false, priority: 45, tag: 'Elections' },
      { id: 'demo-co-6', title: 'Demo County GOP sets Lincoln Day Dinner for February 27', summary: 'The dinner returns to the Riverbend Fairgrounds pavilion. Sponsorship packages open in November.', source: 'Demo County GOP', minutesAgo: 3000, pushed: false, locked: false, priority: 45, tag: 'Party' }
    ],
    cityNews: [
      { id: 'demo-ci-1', title: 'Riverbend council delays vote on downtown sales tax measure', summary: 'Council members asked staff for a spending plan before placing the measure on a future ballot. Merchants want any new revenue dedicated to streets and police.', source: 'Demo County Courier', minutesAgo: 260, pushed: false, locked: false, priority: 50, tag: 'Riverbend' },
      { id: 'demo-ci-2', title: 'Oak Hollow school board trims $1.1 million from central office budget', summary: 'The board consolidated two coordinator roles and renegotiated a transportation contract. Classroom staffing stays the same.', source: 'Valley Ledger', minutesAgo: 540, pushed: false, locked: false, priority: 50, tag: 'Oak Hollow' },
      { id: 'demo-ci-3', title: 'Cedar Flats approves new well to replace aging city supply', summary: 'The $3.4 million project is funded by a state grant and existing water reserves. Construction starts in March.', source: 'Demo County Courier', minutesAgo: 1020, pushed: false, locked: false, priority: 45, tag: 'Cedar Flats' },
      { id: 'demo-ci-4', title: 'Millbrook adds evening hours at public library', summary: 'The library will stay open until 8 PM on weekdays starting in November, funded by a local foundation gift.', source: 'Valley Ledger', minutesAgo: 1500, pushed: false, locked: false, priority: 40, tag: 'Millbrook' },
      { id: 'demo-ci-5', title: 'Riverbend repaves Levee Crest Road after resident petition', summary: 'More than 300 residents signed a petition after winter storms damaged the road. Work finishes before Thanksgiving.', source: 'Demo County Courier', minutesAgo: 2400, pushed: false, locked: false, priority: 40, tag: 'Riverbend' },
      { id: 'demo-ci-6', title: 'Harvest festival draws record crowd to Millbrook', summary: 'Organizers counted about 9,000 visitors over two days. Proceeds support the volunteer fire department.', source: 'Valley Ledger', minutesAgo: 3500, pushed: false, locked: false, priority: 35, tag: 'Millbrook' }
    ],
    videos: [
      { id: 'demo-vid-1', channel: 'Liberty Hour', title: 'Mail ballots 101: return, track and confirm your vote', duration: '12:41', views: 18420, pushed: true },
      { id: 'demo-vid-2', channel: 'The Precinct Report', title: 'Twenty days out: what a strong final canvass looks like', duration: '9:08', views: 11260, pushed: true },
      { id: 'demo-vid-3', channel: 'Capitol Brief', title: 'Water storage permitting: what the new proposal means for growers', duration: '6:54', views: 9870, pushed: true },
      { id: 'demo-vid-4', channel: 'Main Street Minute', title: 'Small business owners on permits, fees and staying open', duration: '7:36', views: 8740, pushed: true },
      { id: 'demo-vid-5', channel: 'Demo County GOP Live', title: 'Meet Grace Thornbury, candidate for School Board Trustee Area 2', duration: '11:15', views: 940, pushed: false },
      { id: 'demo-vid-6', channel: 'Demo County GOP Live', title: 'Yard sign drop-off: how to request and place a sign', duration: '4:48', views: 615, pushed: false }
    ],
    localAds: [
      { id: 'demo-ad-1', placement: 'SIDEBAR_TOP', title: 'Lincoln Day Dinner 2027: reserve your table', sponsor: 'Demo County GOP Finance Committee', cta: 'Become a sponsor' },
      { id: 'demo-ad-2', placement: 'IN_FEED', title: 'Selling feed and fencing to Demo County ranches since 1964.', sponsor: 'Hollister Gap Feed & Supply', cta: 'See weekly specials' },
      { id: 'demo-ad-3', placement: 'FOOTER_BANNER', title: 'Candidate Forum: City Council and Water District races, Oct 21', sponsor: 'Demo County GOP Candidate Committee', cta: 'Reserve a seat' }
    ],
    events: [
      { id: 'demo-ev-1', title: 'Weekend Phone Bank: Get Out the Vote', date: '2026-10-17', time: '10:00 AM', location: 'Demo County GOP Office, 318 Granary Row, Cedar Flats', rsvps: 17, kind: 'Phone bank' },
      { id: 'demo-ev-2', title: 'Candidate Forum: City Council and Water District', date: '2026-10-21', time: '6:30 PM', location: 'Riverbend Grange Hall', rsvps: 58, kind: 'Forum' },
      { id: 'demo-ev-3', title: 'Final Weekend Canvass Launch', date: '2026-10-31', time: '9:00 AM', location: 'Millbrook Community Park', rsvps: 26, kind: 'Canvass' },
      { id: 'demo-ev-4', title: 'Election Night Watch Party', date: '2026-11-03', time: '7:30 PM', location: 'Oak Hollow Lanes & Grill', rsvps: 81, kind: 'Watch party' },
      { id: 'demo-ev-5', title: 'Lincoln Day Dinner 2027', date: '2027-02-27', time: '6:00 PM', location: 'Riverbend Fairgrounds Pavilion', rsvps: 39, kind: 'Lincoln Day Dinner' }
    ],
    stats: { visitors7d: 2310, newsletter: 1480, volunteers: 96, donationsUsd: 14200 }
  });

  // ======================= NETWORK =======================
  var kpis = { sites: 26, weeklyVisitors: 48200, candidatesRecruited: 141, volunteers: 2318, donationsUsd: 1204500, illustrative: true };

  var weeklyVisitors = [21400, 22900, 23800, 25600, 26300, 28900, 30400, 31800, 34600, 36900, 39800, 42700, 45100, 48200];
  var weeklySignups = [138, 151, 149, 172, 180, 205, 221, 238, 276, 312, 365, 428, 502, 611];
  var weeklyDonations = [38200, 41600, 39800, 46300, 49100, 55700, 58200, 63900, 71400, 80600, 92300, 104800, 121500, 142700];
  var weekly = weeklyVisitors.map(function (v, i) {
    var d = new Date(Date.UTC(2026, 6, 13 + i * 7));
    return { week: d.toISOString().slice(0, 10), visitors: v, signups: weeklySignups[i], donationsUsd: weeklyDonations[i] };
  });

  function county(slug, name, status, region, extra) {
    var c = { slug: slug, name: name, state: 'CA', status: status, visitors7d: 0, volunteers: 0, candidates: 0, donationsUsd: 0, region: region };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  var counties = [
    county('svgop', 'Santa Clara', 'live', 'bay-area', { visitors7d: svgop.stats.visitors7d, volunteers: svgop.stats.volunteers, candidates: svgop.candidates.length, donationsUsd: svgop.stats.donationsUsd }),
    county('demo', 'Demo', 'live', 'central-valley', { visitors7d: demo.stats.visitors7d, volunteers: demo.stats.volunteers, candidates: demo.candidates.length, donationsUsd: demo.stats.donationsUsd }),
    county('san-mateo', 'San Mateo', 'onboarding', 'bay-area'),
    county('placer', 'Placer', 'onboarding', 'sacramento-valley'),
    county('orange', 'Orange', 'onboarding', 'southern-california'),
    county('san-luis-obispo', 'San Luis Obispo', 'onboarding', 'central-coast'),
    county('alameda', 'Alameda', 'invited', 'bay-area'),
    county('contra-costa', 'Contra Costa', 'invited', 'bay-area'),
    county('san-francisco', 'San Francisco', 'invited', 'bay-area'),
    county('marin', 'Marin', 'invited', 'bay-area'),
    county('sonoma', 'Sonoma', 'invited', 'bay-area'),
    county('solano', 'Solano', 'invited', 'bay-area'),
    county('los-angeles', 'Los Angeles', 'invited', 'southern-california'),
    county('san-diego', 'San Diego', 'invited', 'southern-california'),
    county('riverside', 'Riverside', 'invited', 'southern-california'),
    county('san-bernardino', 'San Bernardino', 'invited', 'southern-california'),
    county('ventura', 'Ventura', 'invited', 'southern-california'),
    county('fresno', 'Fresno', 'invited', 'central-valley'),
    county('kern', 'Kern', 'invited', 'central-valley'),
    county('stanislaus', 'Stanislaus', 'invited', 'central-valley'),
    county('sacramento', 'Sacramento', 'invited', 'sacramento-valley'),
    county('butte', 'Butte', 'invited', 'sacramento-valley'),
    county('monterey', 'Monterey', 'invited', 'central-coast'),
    county('santa-barbara', 'Santa Barbara', 'invited', 'central-coast')
  ];

  var network = {
    name: 'RCCC Network',
    illustrative: true,
    note: 'Figures for counties other than SVGOP and Demo County are samples.',
    kpis: kpis,
    weekly: weekly,
    states: [
      { code: 'CA', name: 'California', counties: 6, status: 'active' },
      { code: 'AZ', name: 'Arizona', counties: 8, status: 'pilot' },
      { code: 'TX', name: 'Texas', counties: 7, status: 'pilot' },
      { code: 'NV', name: 'Nevada', counties: 5, status: 'pilot' },
      { code: 'FL', name: 'Florida', counties: 0, status: 'waitlist' },
      { code: 'GA', name: 'Georgia', counties: 0, status: 'waitlist' },
      { code: 'NC', name: 'North Carolina', counties: 0, status: 'waitlist' },
      { code: 'PA', name: 'Pennsylvania', counties: 0, status: 'waitlist' },
      { code: 'MI', name: 'Michigan', counties: 0, status: 'waitlist' },
      { code: 'WI', name: 'Wisconsin', counties: 0, status: 'waitlist' },
      { code: 'OH', name: 'Ohio', counties: 0, status: 'waitlist' },
      { code: 'CO', name: 'Colorado', counties: 0, status: 'waitlist' }
    ],
    counties: counties,
    regions: [
      { id: 'bay-area', name: 'Bay Area', state: 'CA' },
      { id: 'southern-california', name: 'Southern California', state: 'CA' },
      { id: 'central-valley', name: 'Central Valley', state: 'CA' },
      { id: 'sacramento-valley', name: 'Sacramento Valley', state: 'CA' },
      { id: 'central-coast', name: 'Central Coast', state: 'CA' }
    ],
    pushes: [
      { id: 'p1', title: BREAKING.title, kind: 'alert', scope: 'STATE', targetLabel: 'California · all counties', priority: 120, locked: true, status: 'published', reach: 38400, hiddenBy: [], publishedMinutesAgo: 25 },
      { id: 'p2', title: STATE[0].title, kind: 'article', scope: 'STATE', targetLabel: 'California · all counties', priority: 100, locked: false, status: 'published', reach: 21700, hiddenBy: [], publishedMinutesAgo: 60 },
      { id: 'p3', title: NATIONAL[0].title, kind: 'article', scope: 'ALL_ORGS', targetLabel: 'All counties, all states', priority: 90, locked: false, status: 'published', reach: 30900, hiddenBy: ['demo'], publishedMinutesAgo: 95 },
      { id: 'p4', title: 'Liberty Hour: Mail ballots 101 — return, track and confirm your vote', kind: 'video', scope: 'ALL_ORGS', targetLabel: 'All counties, all states', priority: 80, locked: false, status: 'published', reach: 18420, hiddenBy: [], publishedMinutesAgo: 1440 },
      { id: 'p5', title: 'Sign up to be an election-night poll observer', kind: 'cta', scope: 'REGION', targetLabel: 'Bay Area + Central Valley', priority: 95, locked: false, status: 'scheduled', reach: 0, hiddenBy: [], publishedMinutesAgo: null, scheduledFor: '2026-10-16 08:00' },
      { id: 'p6', title: 'Thank you, volunteers: a final-week message from Master Network', kind: 'article', scope: 'SELECTED', targetLabel: 'SVGOP, Demo County GOP', priority: 70, locked: false, status: 'draft', reach: 0, hiddenBy: [], publishedMinutesAgo: null }
    ],
    masterAds: [
      { id: 'ma-1', placement: 'HEADER_BANNER', title: 'Nationwide Volunteer Weekend: Oct 24–25', sponsor: 'RCCC Network', cta: 'Pick a shift', fillRate: 0.94 },
      { id: 'ma-2', placement: 'SIDEBAR_BOTTOM', title: 'Network Fundraising Drive: fuel the final 20 days', sponsor: 'RCCC Network', cta: 'Chip in', fillRate: 0.88 },
      { id: 'ma-3', placement: 'IN_FEED', title: 'Ironbridge Mutual Insurance: coverage for California families', sponsor: 'Ironbridge Mutual Insurance', cta: 'Learn more', fillRate: 0.71 }
    ],
    sharedAssets: [
      { id: 'sa-1', title: 'Final-week door hanger: "Your ballot is in the mail"', kind: 'Door hanger', fromCounty: 'svgop', downloads: 412, forks: 9, updated: '2026-10-09' },
      { id: 'sa-2', title: 'Bilingual poll-worker recruitment flyer (English / Spanish)', kind: 'Flyer', fromCounty: 'demo', downloads: 268, forks: 6, updated: '2026-10-07' },
      { id: 'sa-3', title: 'Get-out-the-vote phone bank playbook and script', kind: 'Playbook', fromCounty: 'svgop', downloads: 537, forks: 14, updated: '2026-10-12' },
      { id: 'sa-4', title: 'Down-ballot slate yard sign, 18×24', kind: 'Yard sign', fromCounty: 'demo', downloads: 189, forks: 4, updated: '2026-09-28' },
      { id: 'sa-5', title: 'High-propensity NPP (No Party Preference) precinct strategy', kind: 'Precinct strategy', fromCounty: 'svgop', downloads: 301, forks: 11, updated: '2026-10-05' },
      { id: 'sa-6', title: 'Rural precinct walk plan: long driveways and farm roads', kind: 'Precinct strategy', fromCounty: 'demo', downloads: 144, forks: 5, updated: '2026-09-30' },
      { id: 'sa-7', title: 'Candidate forum flyer template', kind: 'Flyer', fromCounty: 'svgop', downloads: 226, forks: 8, updated: '2026-10-02' },
      { id: 'sa-8', title: 'Precinct captain onboarding playbook', kind: 'Playbook', fromCounty: 'demo', downloads: 358, forks: 12, updated: '2026-09-22' }
    ],
    channels: [
      { id: 'ch-1', name: 'Bay Area Chairs', type: 'REGIONAL', counties: ['svgop', 'san-mateo'], unread: 3, messages: [
        { from: 'Margaret Okafor-Lind', county: 'svgop', text: 'Our final-week door hanger is up in Shared files. Precincts that got it in 2024 returned ballots about 6 points faster.', minutesAgo: 410 },
        { from: 'Curtis Albrecht', county: 'san-mateo', text: 'Thanks! Can we swap the QR code to point at our ballot-tracking page instead of yours?', minutesAgo: 352 },
        { from: 'Margaret Okafor-Lind', county: 'svgop', text: 'Yes, copy it and the QR code and footer switch to your county.', minutesAgo: 340 },
        { from: 'Curtis Albrecht', county: 'san-mateo', text: 'Done. Printing 3,000 Thursday. Anyone splitting a print run to get the bulk rate?', minutesAgo: 95 },
        { from: 'Victor Castellanos', county: 'svgop', text: 'We are in for 5,000. I will send the print shop both files today.', minutesAgo: 40 }
      ] },
      { id: 'ch-2', name: 'California Field Directors', type: 'GROUP', counties: ['svgop', 'demo', 'san-mateo', 'placer', 'orange', 'san-luis-obispo'], unread: 5, messages: [
        { from: 'Tessa Romero', county: 'svgop', text: 'Phone-bank script v3 is posted. Opening with "Has your ballot arrived?" doubled our completed calls.', minutesAgo: 620 },
        { from: 'Dale Overstreet', county: 'demo', text: 'Same result here. Rural numbers pick up more between 5 and 7 PM, so we moved our shift.', minutesAgo: 560 },
        { from: 'Rebecca Sandoval', county: 'placer', text: 'How are you recruiting poll workers? Our registrar still has 300 open slots.', minutesAgo: 300 },
        { from: 'Marisa Ocampo', county: 'demo', text: 'We put the bilingual flyer in church bulletins and the feed store. Got 41 sign-ups in a week.', minutesAgo: 270 },
        { from: 'Tessa Romero', county: 'svgop', text: 'Reminder: walk lists for the Oct 31 canvass lock Friday at noon so captains can print.', minutesAgo: 30 }
      ] },
      { id: 'ch-3', name: 'Training Committee', type: 'GROUP', counties: ['svgop', 'demo', 'placer'], unread: 1, messages: [
        { from: 'Diane Tsai', county: 'svgop', text: 'Proposing a joint precinct captain training on Sunday, Oct 18 at 2 PM over Zoom.', minutesAgo: 1500 },
        { from: 'June Akiyama', county: 'demo', text: 'Works for us. We can cover the section on walk lists offline in areas with weak signal.', minutesAgo: 1440 },
        { from: 'Rebecca Sandoval', county: 'placer', text: 'Count us in. Can someone cover observer rules at vote centers?', minutesAgo: 1380 },
        { from: 'Diane Tsai', county: 'svgop', text: 'Harold walked through observer rules last cycle. I will ask him to take 15 minutes.', minutesAgo: 1320 },
        { from: 'June Akiyama', county: 'demo', text: 'Invite is on the shared calendar. 46 RSVPs so far.', minutesAgo: 180 }
      ] },
      { id: 'ch-4', name: 'SVGOP ↔ Demo County GOP', type: 'DIRECT', counties: ['svgop', 'demo'], unread: 2, messages: [
        { from: 'Walter Hendricks', county: 'demo', text: 'Margaret, how did you structure Lincoln Day Dinner sponsorship tiers last year?', minutesAgo: 2600 },
        { from: 'Margaret Okafor-Lind', county: 'svgop', text: 'Three tiers: $500 table host, $1,500 Lincoln, $5,000 Presidential. Presidential includes a reception for 10.', minutesAgo: 2540 },
        { from: 'Walter Hendricks', county: 'demo', text: 'Helpful. We will scale that down for our crowd and start at $300.', minutesAgo: 2480 },
        { from: 'Margaret Okafor-Lind', county: 'svgop', text: 'Want to co-host the shared election-night livestream? Your crowd on screen would be great.', minutesAgo: 75 },
        { from: 'Walter Hendricks', county: 'demo', text: 'Absolutely. We will have a camera at Oak Hollow Lanes by 7:30.', minutesAgo: 50 }
      ] }
    ],
    jointEvents: [
      { id: 'je-1', title: 'Joint Precinct Captain Training', date: '2026-10-18', hosts: ['svgop', 'demo', 'placer'], location: 'Zoom', rsvps: 46 },
      { id: 'je-2', title: 'Election Night Livestream', date: '2026-11-03', hosts: ['svgop', 'demo'], location: 'San Jose and Oak Hollow, streamed live', rsvps: 267 },
      { id: 'je-3', title: 'Post-Election Debrief and 2028 Recruiting Summit', date: '2026-12-05', hosts: ['svgop', 'demo', 'san-mateo'], location: 'Harborline Conference Center, Redwood City', rsvps: 58 }
    ]
  };

  // ---------- sample accounts ----------
  // Seeded into Store.global by auth.js and listed under "Sample accounts" on the sign-in sheet.
  // Emails use example.com and phones use the fictional 555-01xx range. The Master Network admin
  // has tenant null: one account that works in every county.
  function memberId(t, name) {
    var m = t.members.filter(function (x) { return x.name === name; })[0];
    return m ? m.id : null;
  }
  var sampleAccounts = [
    { id: 'acct-svgop-supporter', name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '4085550142', zip: '95125', role: 'supporter', tenant: 'svgop', memberId: null },
    { id: 'acct-svgop-member', name: 'Rosalind Achebe', email: 'rosalind.achebe@example.com', phone: '4085550117', zip: '95014', role: 'member', tenant: 'svgop', memberId: memberId(svgop, 'Rosalind Achebe'), title: 'Assembly District 23' },
    { id: 'acct-svgop-board', name: 'Margaret Okafor-Lind', email: 'margaret.okaforlind@example.com', phone: '4085550101', zip: '95120', role: 'board', tenant: 'svgop', memberId: memberId(svgop, 'Margaret Okafor-Lind'), title: 'Chair' },
    { id: 'acct-demo-supporter', name: 'Casey Lindqvist', email: 'casey.lindqvist@example.com', phone: '5595550163', zip: '93277', role: 'supporter', tenant: 'demo', memberId: null },
    { id: 'acct-demo-member', name: 'Beverly Dawson', email: 'beverly.dawson@example.com', phone: '5595550128', zip: '93274', role: 'member', tenant: 'demo', memberId: memberId(demo, 'Beverly Dawson'), title: 'Assembly District 31' },
    { id: 'acct-demo-board', name: 'Walter Hendricks', email: 'walter.hendricks@example.com', phone: '5595550104', zip: '93291', role: 'board', tenant: 'demo', memberId: memberId(demo, 'Walter Hendricks'), title: 'Chair' },
    { id: 'acct-network-master', name: 'Dana Whitfield', email: 'dana.whitfield@example.com', phone: '9165550190', zip: '95814', role: 'master', tenant: null, memberId: null, title: 'Master Network' }
  ];

  window.DATA = { tenants: { svgop: svgop, demo: demo }, network: network, sampleAccounts: sampleAccounts };
})();
