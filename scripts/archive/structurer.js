const fs = require('fs');
const path = require('path');
const slugify = require('slugify');

function normalize(text) {
    if (!text || typeof text !== 'string') return '';
    return text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ");
}

function generateAliases(name) {
    if (!name) return [];
    const normalized = normalize(name);
    const parts = normalized.split(' ');
    const aliases = [normalized];
    if (parts.length > 1) {
        aliases.push(parts[parts.length - 1]); // Last name
        aliases.push(parts[0]); // First name
    }
    return [...new Set(aliases)];
}

function structurer() {
    const kbPath = path.join(__dirname, '..', 'manual_data', 'kb_analysis.json');
    const kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

    const structured = {
        people: [],
        departments: [],
        transport_routes: [],
        transport_stops: [],
        mtc_routes: [],
        contacts: [],
        facilities: [],
        general: []
    };

    // 1. Process people from KB existing (manual)
    kb.entities.people.forEach((p, index) => {
        const id = (p.full_name || p.name) ? slugify(String(p.full_name || p.name), { lower: true }) : `person-${index}`;
        structured.people.push({
            id,
            name: p.full_name || p.name,
            normalized_name: normalize(p.full_name || p.name),
            aliases: generateAliases(p.full_name || p.name),
            ...p
        });
    });

    // 2. Process transport from manual data
    if (kb.manual.transportation) {
        const trans = kb.manual.transportation;
        
        // MTC Routes
        if (trans.public_transport_mtc && trans.public_transport_mtc.routes) {
            trans.public_transport_mtc.routes.forEach((r, index) => {
                structured.mtc_routes.push({
                    id: `mtc-${r.routeNo}`,
                    ...r,
                    source: 'manual_data'
                });
            });
        }

        // College Routes
        if (trans.transport_detailed_routes) {
            trans.transport_detailed_routes.forEach((r, index) => {
                const routeId = `route-${slugify(String(r.route_no || index), { lower: true })}`;
                structured.transport_routes.push({
                    id: routeId,
                    ...r,
                    source: 'manual_data'
                });

                // Add stops as atomic records
                r.stops.forEach((s, idx) => {
                    structured.transport_stops.push({
                        id: `${routeId}-stop-${idx}`,
                        route_id: routeId,
                        route_no: r.route_no,
                        stop_name: s.stop,
                        normalized_stop: normalize(s.stop),
                        time: s.time,
                        order: idx
                    });
                });

                // Driver contact
                if (r.driver) {
                    const driverId = `driver-${slugify(String(r.driver.name || index), { lower: true })}`;
                    structured.people.push({
                        id: driverId,
                        name: r.driver.name,
                        normalized_name: normalize(r.driver.name),
                        aliases: generateAliases(r.driver.name),
                        role: `Driver - Route ${r.route_no}`,
                        mobile: r.driver.mobile,
                        source: 'manual_data'
                    });
                }
            });
        }
    }

    // 3. Scan Web Pages for more data (Headings and Tables)
    kb.pages.forEach(page => {
        // Find contacts in tables (very common in college sites)
        let activeHeaders = null;
        page.tables.forEach(row => {
            if (!Array.isArray(row)) return;
            const normalizedRow = row.map(c => normalize(c));
            const isHeader = normalizedRow.some(h => h.includes('name') || h.includes('phone') || h.includes('mail') || h.includes('contact'));
            
            if (isHeader) {
                activeHeaders = normalizedRow;
            } else if (activeHeaders) {
                const person = {};
                activeHeaders.forEach((h, idx) => {
                    if (h.includes('name')) person.name = row[idx];
                    if (h.includes('phone') || h.includes('mobile')) person.mobile = row[idx];
                    if (h.includes('mail')) person.email = row[idx];
                });
                if (person.name) {
                    const personId = slugify(String(person.name), { lower: true });
                    structured.people.push({
                        id: personId,
                        normalized_name: normalize(person.name),
                        aliases: generateAliases(person.name),
                        ...person,
                        source: page.url
                    });
                }
            }
        });

        // 4. General Info from pages
        const text = page.content.paragraphs.join(' ');
        if (text.length > 50) {
            structured.general.push({
                url: page.url,
                title: page.title,
                headings: [ ...page.headings.h1, ...page.headings.h2 ],
                text,
                source: 'web_scrape'
            });
        }
    });

    // Deduplication and Validation
    structured.people = structured.people.filter((p, index, self) =>
        index === self.findIndex((t) => (t.id === p.id))
    );

    const structuredDir = path.join(__dirname, '..', 'structured_data');
    if (!fs.existsSync(structuredDir)) fs.mkdirSync(structuredDir);

    Object.keys(structured).forEach(key => {
        fs.writeFileSync(path.join(structuredDir, `${key}.json`), JSON.stringify(structured[key], null, 2));
    });

    console.log('Structuring Complete.');
}

try {
    structurer();
} catch (e) {
    console.error('Structuring Failed:', e);
}
