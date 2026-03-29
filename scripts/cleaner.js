const fs = require('fs');
const path = require('path');
const slugify = require('slugify');

function cleanText(text) {
    if (!text) return '';
    // Remove tabs, multiple newlines, repeated spaces
    let cleaned = text.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    // Remove unnecessary symbols (common in Web scraping like nbsp)
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    return cleaned;
}

function normalizeSpacing(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function removeRepeatedLines(lines) {
    const seen = new Set();
    return lines.filter(line => {
        const cleaned = normalizeSpacing(line.toLowerCase());
        if (cleaned === '' || seen.has(cleaned)) return false;
        seen.add(cleaned);
        return true;
    });
}

function clean() {
    const rawDataDir = path.join(__dirname, '..', 'raw_data');
    const cleanDataDir = path.join(__dirname, '..', 'clean_data');

    if (!fs.existsSync(cleanDataDir)) {
        fs.mkdirSync(cleanDataDir);
    }

    const files = fs.readdirSync(rawDataDir).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        console.log(`Cleaning: ${file}`);
        const raw = JSON.parse(fs.readFileSync(path.join(rawDataDir, file), 'utf8'));

        const cleaned = {
            url: raw.url,
            title: cleanText(raw.title),
            headings: {
                h1: removeRepeatedLines((raw.headings?.h1 || []).map(cleanText)),
                h2: removeRepeatedLines((raw.headings?.h2 || []).map(cleanText)),
                h3: removeRepeatedLines((raw.headings?.h3 || []).map(cleanText))
            },
            content: {
                paragraphs: removeRepeatedLines((raw.content.paragraphs || []).map(cleanText)),
                lists: removeRepeatedLines((raw.content.lists || []).map(cleanText))
            },
            tables: (raw.tables || []).map(row => (row || []).map(cleanText)),
            cleaned_at: new Date().toISOString()
        };

        fs.writeFileSync(path.join(cleanDataDir, file), JSON.stringify(cleaned, null, 2));
    });

    console.log('Cleaning complete.');
}

clean();
