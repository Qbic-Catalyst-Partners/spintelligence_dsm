import { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import styles from "@/styles/glossary.module.css";

const glossaryTerms = [
    {
        term: "Apron",
        category: "Spinning",
        definition: "A rubber part used in drafting systems to control fibers while yarn is being formed.",
    },
    {
        term: "Autoconer",
        category: "Winding",
        definition: "A winding machine that clears yarn faults and winds yarn from ring bobbins to cones.",
    },
    {
        term: "Blend",
        category: "Mixing",
        definition: "A controlled mix of two or more fiber types, lots, or varieties before spinning.",
    },
    {
        term: "Blow Room",
        category: "Blow Room",
        definition: "The opening and cleaning process where fiber tufts are prepared for carding.",
    },
    {
        term: "Bobbin",
        category: "Spinning",
        definition: "A small package on which yarn or roving is wound during production.",
    },
    {
        term: "Carding",
        category: "Carding",
        definition: "The process that opens, cleans, and aligns fibers to form a sliver.",
    },
    {
        term: "Comber",
        category: "Comber",
        definition: "A machine that removes short fibers and impurities to improve yarn quality.",
    },
    {
        term: "Cone",
        category: "Winding",
        definition: "A cross-wound yarn package used for storage, transport, and downstream processing.",
    },
    {
        term: "Count",
        category: "Quality",
        definition: "A number that expresses yarn fineness or thickness.",
    },
    {
        term: "Cots",
        category: "Spinning",
        definition: "Rubber-covered rollers used in drafting to grip and guide fibers.",
    },
    {
        term: "Draft",
        category: "Spinning",
        definition: "The amount by which a fiber strand is attenuated to reduce its thickness.",
    },
    {
        term: "Draw Frame",
        category: "Draw Frame",
        definition: "A machine that doubles and drafts slivers to improve evenness.",
    },
    {
        term: "End Break",
        category: "Quality",
        definition: "A yarn break during running, usually tracked to monitor process performance.",
    },
    {
        term: "Lap",
        category: "Comber",
        definition: "A sheet-like fiber package fed to combing machines.",
    },
    {
        term: "Lycra",
        category: "Spinning",
        definition: "An elastic fiber used when stretch properties are required in yarn.",
    },
    {
        term: "Mixing",
        category: "Mixing",
        definition: "The preparation stage where cotton varieties or fiber lots are combined.",
    },
    {
        term: "Neps",
        category: "Quality",
        definition: "Small tangled fiber knots that can affect yarn and fabric appearance.",
    },
    {
        term: "Noil",
        category: "Comber",
        definition: "Short fiber removed during combing.",
    },
    {
        term: "Ring Frame",
        category: "Spinning",
        definition: "The machine that converts roving into yarn by drafting and twisting.",
    },
    {
        term: "Roving",
        category: "Simplex",
        definition: "A lightly twisted strand produced before final spinning.",
    },
    {
        term: "Simplex",
        category: "Simplex",
        definition: "The process that converts drawn sliver into roving.",
    },
    {
        term: "Sliver",
        category: "Carding",
        definition: "A continuous untwisted strand of fibers produced by carding, drawing, or combing.",
    },
    {
        term: "Spindle",
        category: "Spinning",
        definition: "The rotating part of a ring frame that helps twist and wind yarn.",
    },
    {
        term: "Spinning",
        category: "Spinning",
        definition: "The process of converting fibers into yarn by drafting and twisting.",
    },
    {
        term: "Twist",
        category: "Spinning",
        definition: "The spiral turns inserted into yarn to give it strength.",
    },
    {
        term: "Uster",
        category: "Quality",
        definition: "A common yarn testing reference used for evenness and quality measurements.",
    },
    {
        term: "Wrapping",
        category: "Quality",
        definition: "A quality-control activity used to inspect yarn appearance on a board.",
    },
];

const alphabet = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const categories = ["All Categories", ...Array.from(new Set(glossaryTerms.map((item) => item.category))).sort()];

function getInitial(term) {
    const first = term.trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : "#";
}

function Glossary() {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeLetter, setActiveLetter] = useState("All");
    const [activeCategory, setActiveCategory] = useState("All Categories");

    const filteredTerms = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return glossaryTerms
            .filter((item) => activeLetter === "All" || getInitial(item.term) === activeLetter)
            .filter((item) => activeCategory === "All Categories" || item.category === activeCategory)
            .filter((item) => {
                if (!query) return true;
                return (
                    item.term.toLowerCase().includes(query) ||
                    item.definition.toLowerCase().includes(query) ||
                    item.category.toLowerCase().includes(query)
                );
            })
            .sort((a, b) => a.term.localeCompare(b.term));
    }, [activeCategory, activeLetter, searchTerm]);

    const groupedTerms = useMemo(() => {
        return filteredTerms.reduce((groups, item) => {
            const initial = getInitial(item.term);
            if (!groups[initial]) groups[initial] = [];
            groups[initial].push(item);
            return groups;
        }, {});
    }, [filteredTerms]);

    const visibleLetters = Object.keys(groupedTerms).sort();

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Glossary</h1>

            <div className={styles.layout}>
                <aside className={styles.sidebar} aria-label="Glossary filters">
                    <div className={styles.filterCard}>
                        <label className={styles.searchBox}>
                            <FiSearch aria-hidden="true" />
                            <input
                                type="search"
                                value={searchTerm}
                                placeholder="Search"
                                aria-label="Search glossary"
                                onChange={(event) => setSearchTerm(event.target.value)}
                            />
                        </label>

                        <div className={styles.letterGrid} aria-label="Filter by letter">
                            <button
                                type="button"
                                className={activeLetter === "All" ? styles.activeLetter : ""}
                                onClick={() => setActiveLetter("All")}
                            >
                                All
                            </button>
                            {alphabet.map((letter) => (
                                <button
                                    type="button"
                                    key={letter}
                                    className={activeLetter === letter ? styles.activeLetter : ""}
                                    onClick={() => setActiveLetter(letter)}
                                >
                                    {letter}
                                </button>
                            ))}
                        </div>

                        <p className={styles.resultCount}>Showing {filteredTerms.length} of {glossaryTerms.length} terms</p>
                    </div>

                    <label className={styles.categoryField}>
                        <span>Categories</span>
                        <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
                            {categories.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </label>
                </aside>

                <section className={styles.termList} aria-label="Glossary terms">
                    {visibleLetters.length ? (
                        visibleLetters.map((letter) => (
                            <article key={letter} className={styles.letterSection}>
                                <div className={styles.letterHeader}>
                                    <span>{letter}</span>
                                    <small>{groupedTerms[letter].length} Terms</small>
                                </div>

                                <div className={styles.terms}>
                                    {groupedTerms[letter].map((item) => (
                                        <div key={item.term} className={styles.termItem}>
                                            <div className={styles.termTopline}>
                                                <h2>{item.term}</h2>
                                                <span>{item.category}</span>
                                            </div>
                                            <p>{item.definition}</p>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ))
                    ) : (
                        <div className={styles.emptyState}>No glossary terms found.</div>
                    )}
                </section>
            </div>

        </div>
    );
}

export default Glossary;
