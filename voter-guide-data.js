/* voter-guide-data.js — window.VOTER_GUIDES, keyed by tenant slug.
   SVGOP: the committee's real 2026 General Election card (svgop.com/voter-guide), typed in from the printed guide.
   Demo: statewide races and statewide measures only (same for every California county); local races
   appear after that committee votes. */
(function () {
  'use strict';

  var IMG = 'images/voter-guide/';

  var STATEWIDE = [
    { office: 'Governor', name: 'Steve Hilton', photo: IMG + 'steve-hilton.jpg', top: true },
    { office: 'Lieutenant Governor', name: 'Gloria Romero', photo: IMG + 'gloria-romero.jpg', top: true },
    { office: 'Attorney General', name: 'Michael E. Gates', photo: IMG + 'michael-gates.jpg', top: true },
    { office: 'Secretary of State', name: 'Donald P. (Don) Wagner', photo: IMG + 'don-wagner.jpg' },
    { office: 'Controller', name: 'Herb W. Morgan', photo: IMG + 'herb-morgan.jpg' },
    { office: 'Treasurer', name: 'Jennifer Hawks', photo: IMG + 'jennifer-hawks.jpg' },
    { office: 'Superintendent of Public Instruction', name: 'Sonja Shaw', photo: IMG + 'sonja-shaw.jpg' }
  ];

  var STATE_MEASURES = [
    { id: 'Prop 1', vote: 'NO', why: 'Sacramento plays mortgage banker with $11 billion in taxes' },
    { id: 'Prop 2', vote: 'NO', why: 'Removes spending limits, cancels your tax rebates' },
    { id: 'Prop 3', vote: 'NO', why: 'Tax called temporary in 2012, now they want it forever' },
    { id: 'Prop 4', vote: 'NO', why: 'Your taxes pay for their campaign ads. What a deal.' },
    { id: 'Prop 5', vote: 'NO', why: 'Hands off our recall process!' },
    { id: 'Prop 37', vote: 'NO', why: 'State plays mortgage banker for another $25 billion in taxes' },
    { id: 'Prop 38', vote: 'NO', why: 'Half of the $8.4 billion invested aimed at one single NGO' },
    { id: 'Prop 39', vote: 'YES', why: 'Voter ID assures only citizens can vote' },
    { id: 'Prop 40', vote: 'NO', why: '“Billionaire Tax” would run off more employers' },
    { id: 'Prop 41', vote: 'YES', why: 'Requires clean audit before new special taxes levied on us' },
    { id: 'Prop 42', vote: 'YES', why: 'Hands off my personal property!' },
    { id: 'Prop 43', vote: 'YES', why: 'Saves Prop 13' },
    { id: 'Prop 44', vote: 'NO', why: 'No more forced unionization in health care' },
    { id: 'Prop 45', vote: 'YES', why: 'Tames CEQA costs for housing construction' }
  ];

  window.VOTER_GUIDES = {
    svgop: {
      election: '2026 General Election',
      electionDate: '2026-11-03',
      source: 'https://svgop.com/voter-guide',
      printImage: IMG + 'svgop-2026-guide-cards.jpg',
      sheetImage: IMG + 'svgop-2026-endorsements.jpg',
      paidFor: 'Paid for by Santa Clara County Republican Party, svgop.com. Not authorized by any candidate or candidate’s committee.',
      groups: [
        { id: 'statewide', label: 'Statewide', scope: 'state', races: STATEWIDE },
        { id: 'congress', label: 'U.S. House', scope: 'local', races: [
          { office: 'U.S. Representative, District 16', name: 'Peter Sundin Soulé', photo: IMG + 'peter-soule.jpg' },
          { office: 'U.S. Representative, District 17', name: 'Ritesh Tandon', photo: IMG + 'ritesh-tandon.jpg' },
          { office: 'U.S. Representative, District 18', name: 'Shane Lewis', photo: IMG + 'shane-lewis.jpg' },
          { office: 'U.S. Representative, District 19', name: 'Peter Coe Verbica' }
        ] },
        { id: 'legislature', label: 'State Legislature', scope: 'local', races: [
          { office: 'State Senate, District 10', name: 'Linda R. Price' },
          { office: 'State Assembly, District 23', name: 'David G. Johnson' },
          { office: 'State Assembly, District 24', name: 'Max Hsia' },
          { office: 'State Assembly, District 25', name: 'Himat Singh Bainiwal' },
          { office: 'State Assembly, District 26', name: 'Tim Gorsulowsky' },
          { office: 'State Assembly, District 28', name: 'Carol Pefley' },
          { office: 'State Assembly, District 29', name: 'Dennis P. Sanchez' }
        ] },
        { id: 'local', label: 'Schools & City', scope: 'local', races: [
          { office: 'Milpitas Unified School District', name: 'Chris Norwood' },
          { office: 'Los Gatos-Saratoga Union HSD, Trustee Area 2', name: 'Ishaan Prasad' },
          { office: 'Alum Rock Union School District, Trustee Area 5', name: 'Línda Lo Chávez' },
          { office: 'Franklin-McKinley School District', name: 'Marc Cooper' },
          { office: 'City of Milpitas, City Council', name: 'Jennie Ha Phan' }
        ] }
      ],
      measures: STATE_MEASURES.map(function (m) { return Object.assign({ scope: 'state' }, m); }).concat([
        { id: 'Measure RTM', vote: 'NO', why: 'No more additional transit taxes for BART', scope: 'local' }
      ])
    },

    demo: {
      election: '2026 General Election',
      electionDate: '2026-11-03',
      printImage: null,
      sheetImage: null,
      paidFor: 'Paid for by Demo County Republican Party. Not authorized by any candidate or candidate’s committee.',
      localPending: 'County, city and school races appear here after the Demo County GOP central committee votes on endorsements.',
      groups: [
        { id: 'statewide', label: 'Statewide', scope: 'state', races: STATEWIDE }
      ],
      measures: STATE_MEASURES.map(function (m) { return Object.assign({ scope: 'state' }, m); })
    }
  };
})();
