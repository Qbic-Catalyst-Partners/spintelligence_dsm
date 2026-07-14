export const thresholdScreenCatalog = {
    "quality-control": {
        mixing: [
            "Process Parameter",
            "Cotton HVI Data Entry",
            "Fibre Data Entry",
            "AFIS Data Entry",
            "Moisture Data Entry",
            "Openness Data Entry",
        ],
        "blow-room": [
            "Blow Room Sync",
            "Process Parameter",
            "BR Waste Study Entry",
            "Drop Test Data Entry",
            "B/R CV1M Data Entry Within Lap",
            "B/R Between Lap CV%",
        ],
        carding: [
            "Process Parameter",
            "Carding NRE%",
            "Nati Data Entry",
            "U% Data Entry",
            "Individual Card Waste Study",
        ],
        comber: [
            "Nati Data Entry",
        ],
        "individual-card-performance": [
            "Individual Card performance Data",
        ],
        "draw-frame": [
            "1 Yard / Half Yard CV Entry",
            "Draw Frame Cots Data Entry",
            "U% Data Entry",
            "PP - Breaker Drawing",
            "PP - Finisher Drawing",
        ],
        simplex: [
            "Process Parameter",
            "SMXCots Change Data Entry",
            "SMX Breaks Study Report",
            "U% Data Entry",
        ],
        spinning: [
            "Process Parameter",
            "COTS Checking",
            "Count Change",
            "Ring Frame Log Book",
            "Speed Checking",
            "Bottom Apron Checking",
            "Lycra Out of Centering",
            "RSM & Lycrasensor Checking Online",
            "RSM & Lycrasensor Checking Offline",
            "Wheel Change",
        ],
        autoconer: [
            "Process Parameter",
            "PP - Autoconer Q2",
            "PP - Autoconer Q3",
            "Rewinding Study",
            "Cone Density",
            "Cone Packing Audit",
            "Lycra % Checking",
            "Count Wise Cuts Record",
            "Splice Strength",
            "Drum wise Appearance",
            "CSP Parameter Entries",
            "U% Parameter Entries",
        ],
    },
    electrical: {
        maintenance: [],
        panels: [],
        utilities: [],
    },
    mechanical: {
        maintenance: [],
        machining: [],
        inspection: [],
    },
};

export const getThresholdScreensForSubDepartment = (departmentSlug, subDepartmentSlug) =>
    thresholdScreenCatalog?.[departmentSlug]?.[subDepartmentSlug] || [];
