const retrievalService = require('../services/retrievalService');
const ragService = require('../services/ragService');
const fs = require('fs');
const path = require('path');

const TEST_QUERIES = [
    // --- ADMISSIONS (Parents) ---
    "What courses are offered?",
    "Admission eligibility for B.Tech IT?",
    "How to apply for admission?",
    "What is the contact for admissions?",
    "Is there a hostel for boys?",
    "Admission office timings?",
    "Engineering admissions process?",
    "Direct admission for masters?",
    "College code for counseling?",
    "Scholarships available?",
    
    // --- TRANSPORT (Students) ---
    "Bus route AR-5 stops?",
    "Who is the driver for route 22?",
    "Earliest bus from college?",
    "Bus stops in Sholinganallur?",
    "Driver contact for route AR-3?",
    "How many buses are there?",
    "Public transport to college?",
    "Route 15 driver contact?",
    "Is there a bus to Adambakkam?",
    "Which bus goes to Velachery?",
    "Route 20 stop timings?",
    
    // --- PEOPLE (Faculty/Admin) ---
    "Who is the Principal?",
    "Who is the HOD of IT?",
    "Tell me about Yogesh R",
    "Who is Ramanathan S?",
    "Dr. Srinivasan CSE department",
    "HOD of CSE?",
    "HOD of EEE department?",
    "Who is Karthikeyan?",
    "Who is the Registrar?",
    "Dr. Santhosh Nathan transport?",
    
    // --- FACILITIES & GENERAL ---
    "Library facilities?",
    "Placement information for 2024?",
    "History of MSAJCE?",
    "College timings?",
    "Vision and mission?",
    "Hostel facilities for girls?",
    "Canteen facilities?",
    "Sports and recreation?",
    "Auditorium information?",
    "Is the college ISO certified?",
    "Which university is it affiliated to?",
    "When was it established?",
    "Placement record 2023?",
    "Placement record 2024?",
    "Hostel fee structure?",
    "Boys hostel details?",
    "Girls hostel details?",
    "IT department details?",
    "CSE office?"
];

async function runTest() {
    console.log(`[TEST] Running ${TEST_QUERIES.length} queries...`);
    const results = [];
    
    for (const q of TEST_QUERIES) {
        console.log(`- Query: ${q}`);
        // 1. Simulate Bot Logic
        let response = null;
        let domain = 'RAG';

        const isTransport = q.match(/\b(bus|route|stop|ar-|van)\b/i);
        const isPerson = retrievalService.isPersonQuery(q);
        const isDept = q.match(/\b(dept|department|hod|office)\b/i);

        if (isPerson) {
            response = await retrievalService.handlePersonQuery(q);
            if (response) domain = 'DETERMINISTIC_PERSON';
        } else if (isDept) {
            response = await retrievalService.handleDeptQuery(q);
            if (response) domain = 'DETERMINISTIC_DEPT';
        } else if (isTransport) {
            response = await retrievalService.handleTransportQuery(q);
            if (response) domain = 'DETERMINISTIC_TRANSPORT';
        }

        if (!response) {
            const context = await retrievalService.retrieve(q);
            const rag = await ragService.generate(q, context, []);
            response = rag.response;
            domain = 'RAG_FALLBACK';
        }

        const success = !response.includes("I couldn't find") && !response.includes("Internal error");
        results.push({ query: q, domain, response: response.substring(0, 100) + '...', success });
    }

    const failed = results.filter(r => !r.success);
    console.log(`\n[RESULTS] Total: ${results.length}, Success: ${results.length - failed.length}, Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        console.log('\n[FAILURES]:');
        failed.forEach(f => console.log(`- [${f.domain}] ${f.query}`));
    }

    fs.writeFileSync(path.join(__dirname, '../test_results.json'), JSON.stringify(results, null, 2));
    process.exit(0);
}

runTest();
