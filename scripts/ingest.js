const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

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

// Alias Generation (Part 9)
const generateAliases = (name) => {
    const n = normalize(name);
    const parts = n.split(' ');
    const aliases = new Set([n]);
    if (parts.length > 1) {
        aliases.add(parts[parts.length - 1]); // Last name
        aliases.add(parts[0]); // First name
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
    const departments = [];

    // 2. Process Personal Profile (Part 6)
    if (data.personal_profile) {
        const p = data.personal_profile;
        people.push({
            name: p.full_name,
            normalized_name: normalize(p.full_name),
            aliases: [...generateAliases(p.full_name), ...(p.preferred_name || [])],
            role: 'User Profile / B.Tech IT Student',
            department: 'Information Technology',
            education: p.education,
            projects: p.projects,
            type: 'PERSON'
        });
    }

    // 3. Process Transportation (Detailed Routes)
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

    // 4. Process MTC (Public Transport)
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

    // 5. Atomic File Storage (Part 10)
    const structured = [
        { name: 'Admissions Office', hod: 'Registrar', contact: '044-27470025', type: 'ADMIN' },
        { name: 'Information Technology', code: 'IT', hod: 'Dr. Elliss Yogesh R', type: 'DEPT' },
        { name: 'Computer Science', code: 'CSE', hod: 'Dr. Srinivasan', type: 'DEPT' },
        { name: 'Transport Office', hod: 'Dr. K.P. Santhosh Nathan', contact: '98408 86992', type: 'ADMIN' }
    ];

    fs.writeFileSync(path.join(__dirname, '../structured_data/people.json'), JSON.stringify(people, null, 2));
    fs.writeFileSync(path.join(__dirname, '../structured_data/transport_routes.json'), JSON.stringify(routes, null, 2));
    fs.writeFileSync(path.join(__dirname, '../structured_data/transport_stops.json'), JSON.stringify(stops, null, 2));
    fs.writeFileSync(path.join(__dirname, '../structured_data/mtc_routes.json'), JSON.stringify(mtc, null, 2));
    fs.writeFileSync(path.join(__dirname, '../structured_data/structured_data.json'), JSON.stringify(structured, null, 2));

    // 6. DB Sync (Part 2)
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        
        console.log('[SYNC] Database Integration...');
        
        await db.collection('entities_master').deleteMany({});
        if (people.length > 0) await db.collection('entities_master').insertMany(people);
        
        await db.collection('transport_routes').deleteMany({});
        if (routes.length > 0) await db.collection('transport_routes').insertMany(routes);
        
        await db.collection('transport_stops').deleteMany({});
        if (stops.length > 0) await db.collection('transport_stops').insertMany(stops);
        
        await db.collection('mtc_routes').deleteMany({});
        if (mtc.length > 0) await db.collection('mtc_routes').insertMany(mtc);

        await db.collection('structured_data').deleteMany({});
        if (structured.length > 0) await db.collection('structured_data').insertMany(structured);

        console.log('[SUCCESS] Production System Data Ingested.');
    } catch (e) {
        console.error('[ERROR] Sync Failed:', e.message);
    } finally {
        await client.close();
    }
};

runPipeline();
