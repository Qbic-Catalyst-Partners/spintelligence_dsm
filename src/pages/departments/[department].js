import SubDepartmentDirectory from "@/views/departments/SubDepartmentDirectory";
import { departmentDirectory } from "@/views/departments/data";

export default function DepartmentPage({ department }) {
    return <SubDepartmentDirectory initialDepartment={department} />;
}

export function getStaticPaths() {
    return {
        paths: departmentDirectory
            .filter((department) => department.slug !== "quality-control")
            .map((department) => ({
                params: { department: department.slug },
            })),
        fallback: false,
    };
}

export function getStaticProps({ params }) {
    return {
        props: {
            department: params.department,
        },
    };
}
