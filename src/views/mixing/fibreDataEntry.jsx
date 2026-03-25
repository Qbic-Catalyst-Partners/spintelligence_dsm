import CustomSelect from "@/components/CustomSelect";
import styles from './fibreDataEntry.module.css';

function FibreDataEntry() {
    return (
        <>
            {/* Row 1 */}
            <div className={styles['mixx-row']}>
                <CustomSelect options={[
                    { id: 1, name: "Polyester" },
                    { id: 2, name: "Viscose" },
                ]} />
                <CustomSelect options={[
                    { id: 1, name: "uma" },
                    { id: 2, name: "dharshini" },
                    { id: 2, name: "sneha" },

                ]} />
                <div className={styles['mixx-group']}>
                    <label>Invoice No</label>
                    <input
                        className={styles['mixx-input']}
                    // value={formData.invoiceNo}
                    // onChange={(e) => handleChange("invoiceNo", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Invoice Date</label>
                    <input
                        type="date"
                        className={styles['mixx-input']}
                    // value={formData.invoiceDate}
                    // onChange={(e) => handleChange("invoiceDate", e.target.value)}
                    />
                </div>
            </div>

            {/* Row 2 */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Cut Length</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Cut Length"
                    // value={formData.cutLength}
                    // onChange={(e) => handleChange("cutLength", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Length CV</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Length CV"
                    // value={formData.lengthCV}
                    // onChange={(e) => handleChange("lengthCV", e.target.value)}
                    />
                </div>

                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`}></div>
            </div>

            {/* Row 3 */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Mean Denier</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Mean Denier"
                    // value={formData.meanDenier}
                    // onChange={(e) => handleChange("meanDenier", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>CV per Denier</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter CV per Denier"
                    // value={formData.cvPerDenier}
                    // onChange={(e) => handleChange("cvPerDenier", e.target.value)}
                    />
                </div>

                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`}></div>
            </div>

            {/* Row 4 */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Tenacity</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Tenacity"
                    // value={formData.tenacity}
                    // onChange={(e) => handleChange("tenacity", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>CV per Tenacity</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter CV per Tenacity"
                    // value={formData.cvPerTenacity}
                    // onChange={(e) => handleChange("cvPerTenacity", e.target.value)}
                    />
                </div>

                <div className="mixx-group mixx-empty"></div>
            </div>

            {/* Row 5 */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Elongation</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Elongation"
                    // value={formData.elongationFiber}
                    // onChange={(e) => handleChange("elongationFiber", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>CV per Elongation</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter CV per Elongation"
                    // value={formData.cvPerElongation}
                    // onChange={(e) => handleChange("cvPerElongation", e.target.value)}
                    />
                </div>

                <div className={`${styles['mixx-group']} ${styles['mixx-empty']}`}></div>
            </div>

            {/* Row 6 */}
            <div className={styles['mixx-row']}>
                <div className={styles['mixx-group']}>
                    <label>Crimp (ARC/CM)</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Crimp"
                    // value={formData.crimp}
                    // onChange={(e) => handleChange("crimp", e.target.value)}
                    />
                </div>

                <div className={styles['mixx-group']}>
                    <label>Whiteness Index</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Whiteness Index"
                    // value={formData.whitenessIndex}
                    // onChange={(e) => handleChange("whitenessIndex", e.target.value)}
                    />
                </div>
                <div className={styles['mixx-group']}>
                    <label>Spin Finish</label>
                    <input
                        className={styles['mixx-input']}
                        placeholder="Enter Spin Finish"
                    // value={formData.spinFinish}
                    // onChange={(e) => handleChange("spinFinish", e.target.value)}
                    />
                </div>
            </div>
        </>
    );
}

export default FibreDataEntry;
