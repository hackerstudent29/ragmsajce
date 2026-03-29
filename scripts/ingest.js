const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const retrievalService = require('../services/retrievalService');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';

// Normalization (Part 8)
const normalize = (str) => {
    if (!str) return '';
    return str.toLowerCase()
              .replace(/(mr|ms|mrs|dr|prof|m\.e|ph\.d|h\.o\.d|p\.r\.o|p\.e|m\.e)\.?\s+/gi, '')
              .replace(/[^\w\s]/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
};

const generateAliases = (name) => {
    const n = normalize(name);
    const parts = n.split(' ');
    const aliases = new Set([n]);
    if (parts.length > 1) {
        aliases.add(parts[parts.length - 1]);
        aliases.add(parts[0]);
    }
    return Array.from(aliases);
};

const runPipeline = async () => {
    console.log('[PIPELINE] Global Analysis & Structuring...');
    
    // 1. Load Global Data
    const masterPath = path.join(__dirname, '../manual_data/master.json');
    if (!fs.existsSync(masterPath)) {
        console.error('master.json not found');
        return;
    }
    const data = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

    const people = [];
    const routes = [];
    const stops = [];
    const mtc = [];

    // 2. Process Personal Profile
    if (data.personal_profile) {
        const p = data.personal_profile;
        people.push({
            name: p.full_name,
            normalized_name: normalize(p.full_name),
            aliases: [...generateAliases(p.full_name), ...(p.preferred_name || [])],
            role: 'Developer / B.Tech IT Student',
            department: 'Information Technology',
            education: p.education,
            projects: p.projects,
            type: 'STUDENT'
        });
    }

    // 3. Process Transportation
    if (data.transportation && data.transportation.transport_detailed_routes) {
        data.transportation.transport_detailed_routes.forEach(r => {
            routes.push({
                route_no: r.route_no,
                driver: r.driver.name,
                phone: r.driver.mobile,
                type: 'COLLEGE_BUS'
            });
            r.stops.forEach(s => {
                stops.push({
                    stop: s.stop,
                    normalized_stop: normalize(s.stop),
                    time: s.time,
                    route_no: r.route_no
                });
            });
        });
    }

    if (data.transportation && data.transportation.public_transport_mtc) {
        data.transportation.public_transport_mtc.routes.forEach(r => {
            mtc.push({
                route_no: r.routeNo,
                from: r.start,
                to: r.end,
                via: r.via,
                freq: r.freq
            });
        });
    }

    // 4. Global Analysis (Part 5) & Institutional Leaders
    const now = new Date();
    const structured = [
        { name: 'Admissions Office', hod: 'Registrar', contact: '044-27470025', type: 'ADMIN', last_updated: now },
        { name: 'Information Technology', code: 'IT', hod: 'Dr. Elliss Yogesh R', type: 'DEPT', last_updated: now },
        { name: 'Computer Science', code: 'CSE', hod: 'Dr. Srinivasan', type: 'DEPT', last_updated: now },
        { name: 'Electrical & Electronics', code: 'EEE', hod: 'Dr. Karthikeyan', type: 'DEPT', last_updated: now },
        { name: 'Transport Office', hod: 'Dr. K.P. Santhosh Nathan', contact: '98408 86992', type: 'ADMIN', last_updated: now }
    ];

    const knowledge = [
        { category: 'HISTORY', text: 'MSAJCE was established in 2001 by the Mohamed Sathak Trust. It is an ISO 9001:2015 certified institution affiliated with Anna University.', last_updated: now },
        { category: 'GENERAL', text: 'College timings are from 8:30 AM to 3:45 PM for all departments.', last_updated: now },
        { category: 'PLACEMENT', text: 'The 2024 placement season saw 90% students placed with top recruiters like TCS, CTS, and Infosys.', last_updated: now },
        { category: 'TRANSPORT', text: 'The college operates 22 buses across Chennai, Kanchipuram, and Thiruvallur. Total 22 institutional vehicles.', last_updated: now }
    ];

    structured.forEach(s => {
        if (s.hod && s.hod !== 'Registrar') {
            const normalizedHOD = normalize(s.hod);
            people.push({
                name: s.hod,
                normalized_name: normalizedHOD,
                aliases: [...generateAliases(s.hod), s.hod.toLowerCase(), normalizedHOD],
                role: `HOD of ${s.name} (${s.code || 'Admin'})`,
                department: s.name,
                type: 'FACULTY'
            });
        }
    });

    // 4b. CSI Office Bearers (from scraped professionalsocieties data)
    const csiBearers = [
        { name: 'Yogesh R', role: 'CSI President', department: 'Information Technology', batch: '2022-2026', type: 'OFFICE_BEARER' },
        { name: 'Saqlin Mustaq M', role: 'CSI Vice President', department: 'AI&DS', batch: '2023-2027', type: 'OFFICE_BEARER' },
        { name: 'Abu Jabar Mubarak', role: 'CSI Secretary', department: 'CS&BS', batch: '2022-2026', type: 'OFFICE_BEARER' },
        { name: 'Hanuram PR', role: 'CSI Joint Secretary', department: 'CSE', batch: '2023-2027', type: 'OFFICE_BEARER' },
        { name: 'Shivam Vishwakarma', role: 'CSI Joint Secretary', department: 'CSE', batch: '2023-2027', type: 'OFFICE_BEARER' },
        { name: 'Navadharshan', role: 'CSI Treasurer', department: 'CSCS', batch: '2023-2027', type: 'OFFICE_BEARER' },
    ];
    csiBearers.forEach(cb => {
        people.push({
            name: cb.name,
            normalized_name: normalize(cb.name),
            aliases: generateAliases(cb.name),
            role: cb.role,
            department: cb.department,
            batch: cb.batch,
            type: cb.type
        });
    });

    const validate = (list, requiredFields) => list.filter(item => {
        return requiredFields.every(f => item[f] && item[f].toString().trim().length > 0);
    });

    const peopleWithTime = validate(people, ['normalized_name']).map(p => ({ 
        ...p, last_updated: now, aliases: [...new Set(p.aliases)]
    }));
    const routesWithTime = validate(routes, ['route_no']).map(r => ({ ...r, last_updated: now }));
    const stopsWithTime = validate(stops, ['stop', 'route_no']).map(s => ({ ...s, last_updated: now }));
    const mtcWithTime = validate(mtc, ['route_no']).map(m => ({ ...m, last_updated: now }));

    // 5. DB Sync (Part 2)
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        console.log('[SYNC] Database Integration...');

        await db.collection('entities_master').deleteMany({});
        if (peopleWithTime.length > 0) await db.collection('entities_master').insertMany(peopleWithTime);

        await db.collection('transport_routes').deleteMany({});
        if (routesWithTime.length > 0) await db.collection('transport_routes').insertMany(routesWithTime);

        await db.collection('transport_stops').deleteMany({});
        if (stopsWithTime.length > 0) await db.collection('transport_stops').insertMany(stopsWithTime);

        await db.collection('mtc_routes').deleteMany({});
        if (mtcWithTime.length > 0) await db.collection('mtc_routes').insertMany(mtcWithTime);

        await db.collection('structured_data').deleteMany({});
        if (structured.length > 0) await db.collection('structured_data').insertMany(structured);

        await db.collection('vector_store').deleteMany({ category: { $in: ['HISTORY', 'PLACEMENT', 'GENERAL', 'TRANSPORT'] } });
        for (const chunk of knowledge) {
            const embedding = await retrievalService.getEmbedding(chunk.text);
            if (embedding) await db.collection('vector_store').insertOne({ ...chunk, embedding });
        }

        console.log('[SUCCESS] Production System Data Ingested With Timestamps.');
    } catch (e) {
        console.error('[ERROR] Sync Failed:', e.message);
    } finally {
        await client.close();
    }
};

runPipeline();
