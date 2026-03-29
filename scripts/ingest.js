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

    // 4. Global Analysis (Part 5) & Institutional Leaders
    const structured = [
        { name: 'Admissions Office', hod: 'Registrar', contact: '044-27470025', type: 'ADMIN' },
        { name: 'Information Technology', code: 'IT', hod: 'Dr. Elliss Yogesh R', type: 'DEPT' },
        { name: 'Computer Science', code: 'CSE', hod: 'Dr. Srinivasan', type: 'DEPT' },
        { name: 'Transport Office', hod: 'Dr. K.P. Santhosh Nathan', contact: '98408 86992', type: 'ADMIN' }
    ];

    // Add HODs to People for Part 5 Routing
    structured.forEach(s => {
        if (s.hod && s.hod !== 'Registrar') {
            people.push({
                name: s.hod,
                normalized_name: normalize(s.hod),
                aliases: generateAliases(s.hod),
                role: `HOD of ${s.name}`,
                department: s.name,
                type: 'FACULTY'
            });
        }
    });

    const now = new Date();
    const validate = (list, requiredFields) => list.filter(item => {
        const isValid = requiredFields.every(f => item[f] && item[f].toString().trim().length > 0);
        return isValid;
    });

    const peopleWithTime = validate(people, ['normalized_name']).map(p => ({ 
        ...p, last_updated: now, aliases: [...new Set(p.aliases)]
    }));

    // ... (rest of sync logic) ...
    const routesWithTime = validate(routes, ['route_no']).map(r => ({ ...r, last_updated: now }));
    const stopsWithTime = validate(stops, ['stop', 'route_no']).map(s => ({ ...s, last_updated: now }));
    const mtcWithTime = validate(mtc, ['route_no']).map(m => ({ ...m, last_updated: now }));

    // ... (rest of sync logic) ...

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
        if (structuredWithTime.length > 0) await db.collection('structured_data').insertMany(structuredWithTime);

        console.log('[SUCCESS] Production System Data Ingested With Timestamps.');
    } catch (e) {
        console.error('[ERROR] Sync Failed:', e.message);
    } finally {
        await client.close();
    }
};

runPipeline();
