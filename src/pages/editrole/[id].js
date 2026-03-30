import EditRole from "../../views/roles/Editrole";

export default function Page() {
  return <EditRole />;
}

//In Next.js, the file
//  operatordetail/[ticketId].js creates a dynamic route 
// where [ticketId] acts as a URL parameter.
//  This allows the page to handle different ticket IDs dynamically 
// (e.g., /operatordetail/123 or /operatordetail/abc),
//  making it reusable for various ticket details without hardcoding each one.
//  It's a standard Next.js pattern for parameterized routes, 
// similar to how [id].js works in other folders like editrole/[id].js.