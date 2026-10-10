// Field names in the official BOMBA score sheet (assets/score_sheet.pdf), mapped once from
// each field's position on the page. The form's names are irregular (P1-P14, then p15-p210),
// so they are listed explicitly. Line 0 of each slot is the starting player; line 1 is the
// substitute line, left blank (D11).

export const HEADER = {
  division: 'Division', team1No: 'T1', team1Name: 'TEAM NAME 1', team2No: 'T2', team2Name: 'TEAM NAME 2',
  gameNo: 'GAME#', date: 'Today', headCoach: 'Coach', coaches: ['Coach2', 'Coach3', 'Coach4'],
};

// Home/Visitor boxes are printed on the page (no form fields): centres in PDF points.
export const HV = { row1Y: 729, row2Y: 715, hX: 325, vX: 349 };

export const SLOTS = [
  { num: "1", name: "Player1", pos: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], sub: { num: "1_1", name: "Player1_1", pos: ["P8", "P9", "P10", "P11", "P12", "P13", "P14"] } },
  { num: "2", name: "Player2", pos: ["p15", "p16", "p17", "p18", "p19", "p20", "p21"], sub: { num: "2_1", name: "Player2_2", pos: ["p22", "p23", "p24", "p25", "p26", "p27", "p28"] } },
  { num: "3", name: "Player3", pos: ["p29", "p30", "p31", "p32", "p33", "p34", "p35"], sub: { num: "3_1", name: "Player3_3", pos: ["p36", "p37", "p38", "p39", "p40", "p41", "p42"] } },
  { num: "4", name: "Player4", pos: ["p43", "p44", "p45", "p46", "p47", "p48", "p49"], sub: { num: "4_2", name: "Player4_4", pos: ["p50", "p51", "p52", "p53", "p54", "p55", "p56"] } },
  { num: "5", name: "Player5", pos: ["p57", "p58", "p59", "p60", "p61", "p62", "p63"], sub: { num: "5_2", name: "Player5_5", pos: ["p64", "p65", "p66", "p67", "p68", "p69", "p70"] } },
  { num: "6", name: "Player6", pos: ["p71", "p72", "p73", "p74", "p75", "p76", "p77"], sub: { num: "6_2", name: "Player6_6", pos: ["p78", "p79", "p80", "p81", "p82", "p83", "p84"] } },
  { num: "7Row1", name: "Player7", pos: ["p85", "p86", "p87", "p88", "p89", "p90", "p91"], sub: { num: "7Row2", name: "Player7_7", pos: ["p92", "p93", "p94", "p95", "p96", "p97", "p98"] } },
  { num: "8Row3", name: "Player8", pos: ["p99", "p100", "p101", "p102", "p103", "p104", "p105"], sub: { num: "8Row4", name: "Player8_8", pos: ["p106", "p107", "p108", "p109", "p110", "p111", "p112"] } },
  { num: "9Row1", name: "Player9", pos: ["p113", "p114", "p115", "p116", "p117", "p118", "p119"], sub: { num: "9Row2", name: "Player9_9", pos: ["p120", "p121", "p122", "p123", "p124", "p125", "p126"] } },
  { num: "10", name: "Player10", pos: ["p127", "p128", "p129", "p130", "p131", "p132", "p133"], sub: { num: "10_1", name: "Player10_10", pos: ["p134", "p135", "p136", "p137", "p138", "p139", "p140"] } },
  { num: "111", name: "Player11", pos: ["p141", "p142", "p143", "p144", "p145", "p146", "p147"], sub: { num: "111_4", name: "Player11_11", pos: ["p148", "p149", "p150", "p151", "p152", "p153", "p154"] } },
  { num: "112", name: "Player12", pos: ["p155", "p156", "p157", "p158", "p159", "p160", "p161"], sub: { num: "112_4", name: "Player12_12", pos: ["p162", "p163", "p164", "p165", "p166", "p167", "p168"] } },
  { num: "113", name: "Player13", pos: ["p169", "p170", "p171", "p172", "p173", "p174", "p175"], sub: { num: "113_4", name: "Player13_13", pos: ["p176", "p177", "p178", "p179", "p180", "p181", "p182"] } },
  { num: "14", name: "Player14", pos: ["p183", "p184", "p185", "p186", "p187", "p188", "p189"], sub: { num: "14_4", name: "Player14_14", pos: ["p190", "p191", "p192", "p193", "p194", "p195", "p196"] } },
  { num: "15", name: "Player15", pos: ["p197", "p198", "p199", "p200", "p201", "p202", "p203"], sub: { num: "15_4", name: "Player15_15", pos: ["p204", "p205", "p206", "p207", "p208", "p209", "p210"] } },
];
