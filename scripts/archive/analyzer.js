const fs = require('fs');
const path = require('path');

function analyze() {
    const cleanDataDir = path.join(__dirname, '..', 'clean_data');
    const manualDataPath = path.join(__dirname, '..', 'manual_data', 'master.json');
    
    const cleanFiles = fs.readdirSync(cleanDataDir).filter(f => f.endsWith('.json'));
    const cleanData = cleanFiles.map(f => JSON.parse(fs.readFileSync(path.join(cleanDataDir, f), 'utf8')));
    const manualData = JSON.parse(fs.readFileSync(manualDataPath, 'utf8'));

    // Global Knowledge Base
    const kb = {
        pages: cleanData,
        manual: manualData,
        entities: {
            people: [],
            departments: [],
            transport_routes: [],
            contacts: [],
            facilities: []
        }
    };

    // Extracting basic entities from manual data
    if (manualData.personal_profile) {
        kb.entities.people.push({
            ...manualData.personal_profile,
            type: 'student_developer',
            source: 'manual_data'
        });
    }

    if (manualData.transportation) {
        if (manualData.transportation.transport_detailed_routes) {
            manualData.transportation.transport_detailed_routes.forEach(route => {
                kb.entities.transport_routes.push({
                    ...route,
                    source: 'manual_data'
                });
                // Contact from driver
                if (route.driver) {
                    kb.entities.contacts.push({
                        name: route.driver.name,
                        mobile: route.driver.mobile,
                        role: `Driver - Route ${route.route_no}`,
                        source: 'manual_data'
                    });
                }
            });
        }
        if (manualData.transportation.contact) {
            kb.entities.contacts.push({
                ...manualData.transportation.contact,
                role: 'Transport Incharge',
                source: 'manual_data'
            });
        }
    }

    // Heuristics to find names/contacts in web data (simplified for now)
    // In a real production system, we might use NLP/LLM for this.
    // For this pipeline, we will look for patterns or specific keywords.

    console.log('Global Analysis Complete.');
    fs.writeFileSync(path.join(__dirname, '..', 'manual_data', 'kb_analysis.json'), JSON.stringify(kb, null, 2));
}

analyze();
