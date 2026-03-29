const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const slugify = require('slugify');

async function scrape() {
    const urls = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'urls.json'), 'utf8'));
    const rawDataDir = path.join(__dirname, '..', 'raw_data');

    if (!fs.existsSync(rawDataDir)) {
        fs.mkdirSync(rawDataDir);
    }

    const limit = (typeof pLimit === 'function') ? pLimit(5) : pLimit.default(5);

    const tasks = urls.map(url => limit(async () => {
        try {
            console.log(`Scraping: ${url}`);
            const response = await axios.get(url, { timeout: 10000 });
            const html = response.data;
            const $ = cheerio.load(html);

            // Removing noise as requested
            $('nav, footer, script, style, .ads, #navbar, #footer').remove();

            const title = $('title').text().trim();
            const headings = {
                h1: $('h1').map((i, el) => $(el).text().trim()).get(),
                h2: $('h2').map((i, el) => $(el).text().trim()).get(),
                h3: $('h3').map((i, el) => $(el).text().trim()).get()
            };

            const paragraphs = $('p').map((i, el) => $(el).text().trim()).get().filter(p => p.length > 0);
            const lists = $('ul, ol').map((i, el) => {
                return $(el).find('li').map((j, li) => $(li).text().trim()).get();
            }).get().filter(l => l.length > 0);

            const tables = $('table').map((i, table) => {
                const rows = [];
                $(table).find('tr').each((j, tr) => {
                    const cells = $(tr).find('td, th').map((k, cell) => $(cell).text().trim()).get();
                    if (cells.length > 0) rows.push(cells);
                });
                return rows;
            }).get();

            const content = {
                paragraphs,
                lists
            };

            const pageName = slugify(url.replace('https://www.msajce-edu.in/', '') || 'home', { lower: true }) || 'home';
            const fileName = `${pageName}.json`;

            const result = {
                url,
                title,
                headings,
                content,
                tables,
                extracted_at: new Date().toISOString()
            };

            fs.writeFileSync(path.join(rawDataDir, fileName), JSON.stringify(result, null, 2));
            console.log(`Saved: ${fileName}`);
        } catch (e) {
            console.error(`Error scraping ${url}:`, e.message);
        }
    }));

    await Promise.all(tasks);
    console.log('Scraping complete.');
}

scrape();
