import { parse } from 'csv-parse/sync';

const text1 = 'Name,LinkedInURL\nJohn,http\n';
const text2 = 'Name;LinkedInURL\nJohn;http\n';

try {
  const r1 = parse(text1, { columns: true, trim: true });
  console.log('r1', r1);
  
  // Try with array of delimiters
  const r2 = parse(text2, { columns: true, trim: true, delimiter: [',', ';'] });
  console.log('r2', r2);
} catch (e) {
  console.error(e);
}
