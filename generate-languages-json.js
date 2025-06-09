import langsPkg from 'langs';
import cldr from 'cldr';
import { writeFileSync } from 'fs';

const langs = langsPkg.default || langsPkg;

// Extract language territories from CLDR locales
const territories = {};
const extended = {};

cldr.localeIds.forEach(localeId => {
  const parts = localeId.split('_');
  if (parts.length < 2) return;
  
  const [lang, ...rest] = parts;
  
  // Find territory (2-letter code) anywhere in the remaining parts
  const territory = rest.find(part => /^[a-z]{2}$/i.test(part))?.toUpperCase();
  if (!territory) return;
  
  (territories[lang] ??= new Set()).add(territory);
  
  // Generate extended variant if there are extra parts beyond language and territory
  const extraParts = rest.filter(part => part.toLowerCase() !== territory.toLowerCase());
  if (extraParts.length > 0) {
    const extendedCode = `${lang}-${territory}-${extraParts.join('-')}`;
    (extended[lang] ??= new Set()).add(extendedCode);
  }
});

// Convert sets to sorted arrays
Object.keys(territories).forEach(lang => territories[lang] = [...territories[lang]].sort());
Object.keys(extended).forEach(lang => extended[lang] = [...extended[lang]].sort());

// Build complete language data
const languages = langs.all()
  .filter(lang => lang['1'])
  .map(langInfo => {
    const code = langInfo['1'];
    const langTerritories = territories[code] || [];
    
    return {
      name: langInfo.name,
      nativeName: langInfo.local,
      iso6391: code,
      iso6392t: langInfo['2T'] || langInfo['2'],
      iso6392b: langInfo['2B'] || langInfo['2'],
      iso6393: langInfo['3'],
      bcp47: langTerritories.map(territory => `${code}-${territory}`),
      bcp47ext: extended[code] || [],
      territories: langTerritories
    };
  })
  .sort((a, b) => b.territories.length - a.territories.length);

// Save to file
writeFileSync('languages.json', JSON.stringify(languages, null, 2), 'utf8');