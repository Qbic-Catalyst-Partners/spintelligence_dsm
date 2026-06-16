import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FiArrowRight, FiSliders } from "react-icons/fi";

import { hasSubDepartmentAccess } from "@/utils/accessControl";
import styles from "@/styles/processParameterDirectory.module.css";

const processParameterLinks = [
  { href: "/mixing?type=Process%20Parameter", label: "Mixing", department: "Mixing" },
  { href: "/blowroom?type=Process%20Parameter", label: "Blow Room", department: "Blow Room" },
  { href: "/carding?type=Process%20Parameter", label: "Carding", department: "Carding" },
  { href: "/draw-frame?type=PP%20-%20Breaker%20Drawing", label: "Draw Frame", department: "Draw Frame" },
  { href: "/simplex?type=Process%20Parameter", label: "Simplex", department: "Simplex" },
  { href: "/spinning?type=Process%20Parameter", label: "Spinning", department: "Spinning" },
  { href: "/autoconer?type=Process%20Parameter", label: "Autoconer", department: "Autoconer" },
];

export default function ProcessParameterPage() {
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const options = useMemo(
    () =>
      processParameterLinks.filter((link) =>
        hasSubDepartmentAccess(accessByDepartment, link.department, user)
      ),
    [accessByDepartment, user]
  );
  const [selectedHref, setSelectedHref] = useState(options[0]?.href || "");

  const selectedOption = options.find((option) => option.href === selectedHref) || options[0];

  useEffect(() => {
    if (!options.length) {
      setSelectedHref("");
      return;
    }

    if (!options.some((option) => option.href === selectedHref)) {
      setSelectedHref(options[0].href);
    }
  }, [options, selectedHref]);

  const openProcessParameter = () => {
    if (selectedOption?.href) {
      router.push(selectedOption.href);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.icon}>
            <FiSliders />
          </span>
          <div>
            <h1>Process Parameter</h1>
            <p>Select a sub-department to open its process parameter page.</p>
          </div>
        </div>

        {options.length ? (
          <div className={styles.selectorRow}>
            <label className={styles.field}>
              <span>Sub-department</span>
              <select
                value={selectedHref}
                onChange={(event) => setSelectedHref(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.href} value={option.href}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.openButton} onClick={openProcessParameter}>
              <span>Open</span>
              <FiArrowRight />
            </button>
          </div>
        ) : (
          <div className={styles.emptyState}>
            No accessible process parameter departments are available.
          </div>
        )}
      </div>
    </section>
  );
}
