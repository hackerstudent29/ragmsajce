const fs = require('fs');
const path = require('path');
const json5 = require('json5');

const tPath = path.join(__dirname, '..', 't.txt');
const manualDataDir = path.join(__dirname, '..', 'manual_data');

if (!fs.existsSync(manualDataDir)) {
    fs.mkdirSync(manualDataDir);
}

const content = fs.readFileSync(tPath, 'utf8');

// Simple extraction of JSON blocks from t.txt
// It seems there are 3 main sections: personal_profile, chatbot_scope, transportation
// They are written as bare keys in the file, which is not valid JSON as a whole.
// We'll wrap them in curly braces to make it a valid JSON5 object.

const lines = content.split('\n');
let jsonLines = [];
let startCollecting = false;

for (let line of lines) {
    if (line.trim().startsWith('"personal_profile":')) {
        startCollecting = true;
    }
    if (startCollecting) {
        // Stop if we hit URLs or further instructions
        if (line.trim().match(/^\d+\s+Home\s+https/)) break;
        if (line.trim().startsWith('Build a complete')) break;
        jsonLines.push(line);
    }
}

let jsonString = '{' + jsonLines.join('\n') + '}';

// Clean up trailing commas if any before closing brace (json5 handles this, but let's be safe)
try {
    const data = json5.parse(jsonString);
    fs.writeFileSync(path.join(manualDataDir, 'master.json'), JSON.stringify(data, null, 2));
    console.log('Successfully extracted manual data to manual_data/master.json');
} catch (e) {
    console.error('Error parsing manual data from t.txt:', e.message);
    // Fallback: search for the last closing brace and try again
    const lastBraceIndex = jsonString.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
        try {
            const truncatedJsonString = jsonString.substring(0, lastBraceIndex + 1) + '}';
            const data = json5.parse(truncatedJsonString);
            fs.writeFileSync(path.join(manualDataDir, 'master.json'), JSON.stringify(data, null, 2));
            console.log('Successfully extracted manual data (after recovery) to manual_data/master.json');
        } catch (e2) {
            console.error('Recovery failed:', e2.message);
        }
    }
}
