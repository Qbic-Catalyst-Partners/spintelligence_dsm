export const departmentDirectory = [
    {
        slug: "quality-control",
        name: "Quality Control",
        enabled: true,
        description: "Select the Sub-Department you need to access",
        subDepartments: [
            { slug: "mixing", name: "Mixing", href: "/mixing", enabled: true },
            { slug: "blow-room", name: "Blow Room", href: "/blowroom", enabled: true },
            { slug: "carding", name: "Carding", href: "/carding", enabled: true },
            { slug: "comber", name: "Comber", href: "/comber", enabled: true },
            { slug: "draw-frame", name: "Draw Frame", href: "/draw-frame", enabled: true },
            { slug: "simplex", name: "Simplex", href: "/simplex", enabled: true },
            { slug: "spinning", name: "Spinning", href: "/spinning", enabled: true },
            { slug: "autoconer", name: "Autoconer", href: "/autoconer", enabled: true },
        ],
    },
    {
        slug: "electrical",
        name: "Electrical",
        enabled: false,
        description: "Select the Department you need to access",
        subDepartments: [
            { slug: "maintenance", name: "Maintenance", href: "/departments/electrical/maintenance", enabled: false },
            { slug: "panels", name: "Panels", href: "/departments/electrical/panels", enabled: false },
            { slug: "utilities", name: "Utilities", href: "/departments/electrical/utilities", enabled: false },
        ],
    },
    {
        slug: "mechanical",
        name: "Mechanical",
        enabled: false,
        description: "Select the Department you need to access",
        subDepartments: [
            { slug: "maintenance", name: "Maintenance", href: "/departments/mechanical/maintenance", enabled: false },
            { slug: "machining", name: "Machining", href: "/departments/mechanical/machining", enabled: false },
            { slug: "inspection", name: "Inspection", href: "/departments/mechanical/inspection", enabled: false },
        ],
    },
];

export const getDepartmentBySlug = (departmentSlug) =>
    departmentDirectory.find((department) => department.slug === departmentSlug);

export const getSubDepartmentBySlug = (departmentSlug, subDepartmentSlug) =>
    getDepartmentBySlug(departmentSlug)?.subDepartments.find(
        (subDepartment) => subDepartment.slug === subDepartmentSlug
    );
