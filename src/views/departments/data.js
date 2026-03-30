export const departmentDirectory = [
    {
        slug: "quality-control",
        name: "Quality Control",
        enabled: true,
        description: "Select the Department you need to access",
        subDepartments: [
            { slug: "mixing", name: "Mixing", href: "/mixing", enabled: true },
            { slug: "blow-room", name: "Blow Room", href: "/departments/quality-control/blow-room", enabled: false },
            { slug: "carding", name: "Carding", href: "/departments/quality-control/carding", enabled: false },
            { slug: "comber", name: "Comber", href: "/departments/quality-control/comber", enabled: false },
            { slug: "draw-frame", name: "Draw Frame", href: "/departments/quality-control/draw-frame", enabled: false },
            { slug: "simplex", name: "Simplex", href: "/departments/quality-control/simplex", enabled: false },
            { slug: "spinning", name: "Spinning", href: "/spinning", enabled: true },
            { slug: "autoconer", name: "Autoconer", href: "/departments/quality-control/autoconer", enabled: false },
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
