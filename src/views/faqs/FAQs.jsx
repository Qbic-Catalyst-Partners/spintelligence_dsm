import { useMemo, useState } from "react";
import { FiArrowRight, FiChevronDown, FiSend } from "react-icons/fi";
import styles from "@/styles/faqs.module.css";

const faqSections = [
    {
        title: "Getting Started",
        questions: [
            {
                question: "How do I open the right department screen?",
                answer: "Use the Department menu from the sidebar and choose the department or sub-department assigned to your role.",
            },
            {
                question: "Why can I only see some menus?",
                answer: "Menus are controlled by your role permissions. Contact an admin if a required page is missing.",
            },
            {
                question: "How do I switch between light and dark mode?",
                answer: "Use the sun or moon button in the top bar. The setting is remembered for your browser.",
            },
            {
                question: "Where can I find glossary terms?",
                answer: "Open the profile dropdown and select Glossary to search textile and system terms.",
            },
            {
                question: "Where can I ask a new question?",
                answer: "Use the Ask a Question form on the FAQs page and choose the category that best matches your request.",
            },
        ],
    },
    {
        title: "Departments",
        questions: [
            {
                question: "How are department entries organized?",
                answer: "Each department page groups its notebooks, master data, and entry workflows by production area.",
            },
            {
                question: "What should I do if a machine or count is missing?",
                answer: "Check the master data first. If it is still missing, ask an admin to update the relevant dropdown values.",
            },
            {
                question: "Can I edit submitted department data?",
                answer: "Editing depends on the notebook workflow and your permissions. Some entries require review or reopening.",
            },
            {
                question: "Why are some fields disabled?",
                answer: "Disabled fields are usually calculated, read-only, or locked by the current workflow state.",
            },
        ],
    },
    {
        title: "Notebooks",
        questions: [
            {
                question: "How do I submit a notebook?",
                answer: "Complete the required fields, review the entry, and use the submit action available on that notebook page.",
            },
            {
                question: "Where can I see submitted notebook activity?",
                answer: "Open Activity Log from the sidebar to review submitted, approved, and reopened notebook actions.",
            },
            {
                question: "What happens after a notebook is submitted?",
                answer: "The entry becomes part of the workflow and can be reviewed according to the department process.",
            },
            {
                question: "Can I upload OCR data into notebooks?",
                answer: "OCR upload is available on supported entry screens where the upload action is shown.",
            },
        ],
    },
    {
        title: "Ticketing Systems",
        questions: [
            {
                question: "How do I raise or follow a ticket?",
                answer: "Use the Ticketing System menu. L1 and L2 views are shown based on your access.",
            },
            {
                question: "Where can supervisors view ticket performance?",
                answer: "Supervisors can use the L2 Ticketing System and Team Performance analytics pages.",
            },
            {
                question: "How do I see ticket due dates?",
                answer: "Open the relevant ticket calendar from the Ticketing System menu.",
            },
        ],
    },
    {
        title: "Threshold",
        questions: [
            {
                question: "What are threshold values used for?",
                answer: "Thresholds define expected limits for screens and submissions so exceptions can be tracked consistently.",
            },
            {
                question: "Who can change thresholds?",
                answer: "Threshold setup is restricted to users with admin or threshold management access.",
            },
            {
                question: "What is a submission threshold?",
                answer: "It controls expected submission frequency for configured departments, sub-departments, and screens.",
            },
        ],
    },
];

const categories = ["Getting Started", "Departments", "Notebooks", "Ticketing Systems", "Threshold"];

function FAQs() {
    const [activeSection, setActiveSection] = useState("Getting Started");
    const [openQuestion, setOpenQuestion] = useState("Getting Started-0");
    const [formValues, setFormValues] = useState({
        name: "",
        category: "Getting Started",
        question: "",
    });

    const visibleSections = useMemo(() => {
        if (activeSection === "Getting Started") return faqSections;
        return faqSections.filter((section) => section.title === activeSection);
    }, [activeSection]);

    const handleSubmit = (event) => {
        event.preventDefault();
        setFormValues({ name: "", category: "Getting Started", question: "" });
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>FAQs</h1>

            <div className={styles.layout}>
                <aside className={styles.sidebar} aria-label="FAQ categories">
                    <div className={styles.categoryList}>
                        {categories.map((category) => (
                            <button
                                key={category}
                                type="button"
                                className={activeSection === category ? styles.activeCategory : ""}
                                onClick={() => {
                                    setActiveSection(category);
                                    setOpenQuestion(`${category}-0`);
                                }}
                            >
                                <span>{category}</span>
                                <FiArrowRight aria-hidden="true" />
                            </button>
                        ))}
                    </div>

                    <form className={styles.questionForm} onSubmit={handleSubmit}>
                        <h2>Ask a Question</h2>
                        <label>
                            <span>Name</span>
                            <input
                                type="text"
                                value={formValues.name}
                                placeholder="Your name"
                                onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                            />
                        </label>
                        <label>
                            <span>Category</span>
                            <select
                                value={formValues.category}
                                onChange={(event) => setFormValues((current) => ({ ...current, category: event.target.value }))}
                            >
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>Question</span>
                            <textarea
                                value={formValues.question}
                                placeholder="Type your question"
                                rows={4}
                                onChange={(event) => setFormValues((current) => ({ ...current, question: event.target.value }))}
                            />
                        </label>
                        <button type="submit">
                            <FiSend />
                            <span>Submit</span>
                        </button>
                    </form>
                </aside>

                <section className={styles.faqList} aria-label="Frequently asked questions">
                    {visibleSections.map((section) => (
                        <article key={section.title} className={styles.faqSection}>
                            <h2>{section.title}</h2>
                            <div className={styles.questions}>
                                {section.questions.map((item, index) => {
                                    const questionId = `${section.title}-${index}`;
                                    const isOpen = openQuestion === questionId;

                                    return (
                                        <div key={item.question} className={styles.questionItem}>
                                            <button
                                                type="button"
                                                aria-expanded={isOpen}
                                                onClick={() => setOpenQuestion(isOpen ? "" : questionId)}
                                            >
                                                <span>{item.question}</span>
                                                <FiChevronDown className={isOpen ? styles.openIcon : ""} />
                                            </button>
                                            {isOpen && <p>{item.answer}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </section>
            </div>
        </div>
    );
}

export default FAQs;
