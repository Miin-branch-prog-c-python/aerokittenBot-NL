const fs = require('fs');
const translateFiles = []

function reloadTranslateFiles() {
    const files = fs.readdirSync('./translate').filter(file => file.endsWith('.json'));
    translateFiles.length = 0; // Clear the existing array
    for (const file of files) {
        const filePath = `./translate/${file}`;
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const jsonData = JSON.parse(data);
            translateFiles.push({ name: file, data: jsonData });
            console.log(filePath)
        } catch (error) {
            console.error(`Error loading translation file ${file}:`, error);
        }
    }
}
function translate(key, lang, ...args) {
    lang = lang.split('-')[0]; // Use only the language code (e.g., 'en' from 'en-US')
    let file = translateFiles.find(f => f.name === `${lang}.json`);
    if (!file) {
	console.log("fill dos not exist "+ lang + ".json")
        file = translateFiles.find(f => f.name === 'en.json'); // Fallback to English
    }
    let translation = file.data[key] || `**key missing for ${lang}: ${key}**`; // Use the key as a fallback if translation is missing
    // Replace placeholders with arguments
    args.forEach((arg, index) => {
        translation = translation.replace(`{${index}}`, arg);
    });
    return translation;
}
function randomMod() {
    const modNumberString = process.env.MOD_number || '1..4';
    const [min, max] = modNumberString.split('..').map(Number);
    return "MOD_" + (Math.floor(Math.random() * (max - min + 1)) + min);
}
reloadTranslateFiles()
module.exports = {
    reloadTranslateFiles,
    translate,
    randomMod
};
