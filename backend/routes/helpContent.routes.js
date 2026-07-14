const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const parseBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'active'].includes(normalized)) return true;
  if (['false', '0', 'no', 'inactive'].includes(normalized)) return false;
  return fallback;
};

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220);

const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

const getGlossaryTerm = (entry) =>
  cleanText(entry.display_name) || cleanText(entry.input_field) || 'Untitled term';

const getGlossaryCategory = (entry) =>
  cleanText(entry.category) ||
  cleanText(entry.department) ||
  cleanText(entry.sub_department) ||
  cleanText(entry.input_screen) ||
  'Uncategorized';

const getGlossaryLetter = (term) => {
  const first = String(term || '').trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
};

const mapGlossaryEntry = (entry) => {
  const term = getGlossaryTerm(entry);
  const category = getGlossaryCategory(entry);
  return {
    ...entry,
    term,
    title: term,
    category,
    letter: getGlossaryLetter(term),
    definition: entry.description
  };
};

const groupGlossaryEntries = (entries) => {
  const grouped = new Map(ALPHABET.map((letter) => [letter, []]));
  for (const entry of entries) {
    grouped.get(entry.letter)?.push(entry);
  }
  return ALPHABET
    .map((letter) => ({ letter, count: grouped.get(letter).length, terms: grouped.get(letter) }))
    .filter((group) => group.count > 0);
};

const getAllGlossaryCategoryOptions = async (includeInactive = false) => {
  const result = await client.query(`
    SELECT DISTINCT COALESCE(category, department, sub_department, input_screen, 'Uncategorized') AS category
    FROM ticketing_system.glossary_entries
    WHERE ($1::boolean = true OR is_active = true)
    ORDER BY category
  `, [includeInactive]);

  return [
    { value: 'all', label: 'All Categories' },
    ...result.rows
      .map((row) => cleanText(row.category))
      .filter(Boolean)
      .map((category) => ({ value: category, label: category }))
  ];
};

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001';
};

const requireEditor = (req, res, next) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ message: 'Only admins can manage help content' });
  }
  return next();
};

const addFilter = (where, params, column, value, exact = true) => {
  const text = cleanText(value);
  if (!text) return;
  params.push(exact ? text : `%${text}%`);
  where.push(exact ? `LOWER(${column}) = LOWER($${params.length})` : `${column} ILIKE $${params.length}`);
};

const ensureGlossaryCategoryColumn = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.glossary_entries
      ADD COLUMN IF NOT EXISTS category varchar(100) NULL
  `);
};

const getFaqCategory = (faq) => cleanText(faq.category) || 'Getting Started';

const mapFaqEntry = (faq) => ({
  ...faq,
  category: getFaqCategory(faq),
  title: faq.question,
  content: faq.answer,
  accordion_label: faq.question
});

const groupFaqsByCategory = (faqs) => {
  const grouped = new Map();
  for (const faq of faqs) {
    const category = getFaqCategory(faq);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(faq);
  }

  return Array.from(grouped.entries()).map(([category, items]) => ({
    category,
    title: category,
    count: items.length,
    faqs: items,
    items
  }));
};

const getFaqCategoryOptions = (sections, activeCategory = null) =>
  sections.map((section, index) => ({
    value: section.category,
    label: section.category,
    count: section.count,
    active: activeCategory
      ? section.category.toLowerCase() === activeCategory.toLowerCase()
      : index === 0
  }));

const getGuideSection = (guide) => cleanText(guide.section) || 'Getting Started';

const mapGuideEntry = (guide) => ({
  ...guide,
  section: getGuideSection(guide),
  category: getGuideSection(guide),
  question: guide.title,
  answer: guide.content,
  accordion_label: guide.title
});

const groupGuidesBySection = (guides) => {
  const grouped = new Map();
  for (const guide of guides) {
    const section = getGuideSection(guide);
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push(guide);
  }

  return Array.from(grouped.entries()).map(([section, items]) => ({
    section,
    category: section,
    title: section,
    count: items.length,
    guides: items,
    items
  }));
};

const getGuideSectionOptions = (sections, activeSection = null) =>
  sections.map((section, index) => ({
    value: section.section,
    label: section.section,
    count: section.count,
    active: activeSection
      ? section.section.toLowerCase() === activeSection.toLowerCase()
      : index === 0
  }));

router.use(auth);

router.get('/glossary', async (req, res, next) => {
  try {
    await ensureGlossaryCategoryColumn();
    const params = [];
    const where = [];
    const category = cleanText(req.query.category);
    const letter = cleanText(req.query.letter);

    if (req.query.include_inactive !== 'true') {
      where.push('is_active = true');
    }
    if (category && category.toLowerCase() !== 'all') {
      params.push(category);
      where.push(`LOWER(COALESCE(category, department, sub_department, input_screen, 'Uncategorized')) = LOWER($${params.length})`);
    }
    addFilter(where, params, 'department', req.query.department);
    addFilter(where, params, 'sub_department', req.query.sub_department || req.query.subDepartment);
    addFilter(where, params, 'input_screen', req.query.input_screen || req.query.notebook);
    addFilter(where, params, 'input_field', req.query.input_field);
    addFilter(where, params, 'input_field || \' \' || COALESCE(display_name, \'\') || \' \' || COALESCE(category, \'\') || \' \' || COALESCE(department, \'\') || \' \' || COALESCE(sub_department, \'\') || \' \' || description', req.query.search || req.query.q, false);
    if (letter) {
      if (letter === '#') {
        where.push(`COALESCE(NULLIF(UPPER(SUBSTRING(COALESCE(NULLIF(display_name, ''), input_field) FROM 1 FOR 1)), ''), '#') !~ '^[A-Z]$'`);
      } else {
        params.push(letter.toUpperCase());
        where.push(`UPPER(SUBSTRING(COALESCE(NULLIF(display_name, ''), input_field) FROM 1 FOR 1)) = $${params.length}`);
      }
    }

    const result = await client.query(
      `
      SELECT id, input_field, display_name, description, category, department, sub_department, input_screen,
             example_value, unit, is_active, created_at, updated_at
      FROM ticketing_system.glossary_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY UPPER(COALESCE(NULLIF(display_name, ''), input_field)) ASC, id ASC
      `,
      params
    );

    const glossary = result.rows.map(mapGlossaryEntry);
    const letterCounts = ALPHABET.reduce((acc, item) => ({ ...acc, [item]: 0 }), {});
    for (const entry of glossary) letterCounts[entry.letter] += 1;

    return res.status(200).json({
      glossary,
      terms: glossary,
      grouped_glossary: groupGlossaryEntries(glossary),
      alphabet: ALPHABET.map((item) => ({
        letter: item,
        count: letterCounts[item],
        active: item === (letter || '').toUpperCase()
      })),
      categories: await getAllGlossaryCategoryOptions(req.query.include_inactive === 'true'),
      total_terms: glossary.length,
      filtered_terms: glossary.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/glossary/categories', async (req, res, next) => {
  try {
    await ensureGlossaryCategoryColumn();
    return res.status(200).json({
      categories: await getAllGlossaryCategoryOptions(req.query.include_inactive === 'true')
    });
  } catch (error) {
    next(error);
  }
});

router.post('/glossary', requireEditor, async (req, res, next) => {
  try {
    await ensureGlossaryCategoryColumn();
    const inputField = cleanText(req.body?.input_field);
    const description = cleanText(req.body?.description);
    if (!inputField || !description) {
      return res.status(400).json({ message: 'input_field and description are required' });
    }

    const result = await client.query(
      `
      INSERT INTO ticketing_system.glossary_entries
        (input_field, display_name, description, category, department, sub_department, input_screen, example_value, unit, is_active, created_by_user_id, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      RETURNING id, input_field, display_name, description, category, department, sub_department, input_screen, example_value, unit, is_active, created_at, updated_at
      `,
      [
        inputField,
        cleanText(req.body?.display_name),
        description,
        cleanText(req.body?.category),
        cleanText(req.body?.department),
        cleanText(req.body?.sub_department),
        cleanText(req.body?.input_screen || req.body?.notebook),
        cleanText(req.body?.example_value),
        cleanText(req.body?.unit),
        parseBool(req.body?.is_active, true),
        parsePositiveInt(req.user?.id)
      ]
    );

    return res.status(201).json({ success: true, glossary_entry: mapGlossaryEntry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/glossary/:id', requireEditor, async (req, res, next) => {
  try {
    await ensureGlossaryCategoryColumn();
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid glossary id is required' });

    const result = await client.query(
      `
      UPDATE ticketing_system.glossary_entries
      SET input_field = COALESCE($2, input_field),
          display_name = COALESCE($3, display_name),
          description = COALESCE($4, description),
          category = COALESCE($5, category),
          department = COALESCE($6, department),
          sub_department = COALESCE($7, sub_department),
          input_screen = COALESCE($8, input_screen),
          example_value = COALESCE($9, example_value),
          unit = COALESCE($10, unit),
          is_active = COALESCE($11, is_active),
          updated_by_user_id = $12,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, input_field, display_name, description, category, department, sub_department, input_screen, example_value, unit, is_active, created_at, updated_at
      `,
      [
        id,
        cleanText(req.body?.input_field),
        cleanText(req.body?.display_name),
        cleanText(req.body?.description),
        cleanText(req.body?.category),
        cleanText(req.body?.department),
        cleanText(req.body?.sub_department),
        cleanText(req.body?.input_screen || req.body?.notebook),
        cleanText(req.body?.example_value),
        cleanText(req.body?.unit),
        req.body?.is_active === undefined ? null : parseBool(req.body.is_active),
        parsePositiveInt(req.user?.id)
      ]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Glossary entry not found' });
    return res.status(200).json({ success: true, glossary_entry: mapGlossaryEntry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/glossary/:id', requireEditor, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid glossary id is required' });
    const result = await client.query(
      `UPDATE ticketing_system.glossary_entries SET is_active = false, updated_by_user_id = $2, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
      [id, parsePositiveInt(req.user?.id)]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Glossary entry not found' });
    return res.status(200).json({ success: true, glossary_entry: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/faqs', async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    const category = cleanText(req.query.category);
    if (req.query.include_inactive !== 'true') where.push('is_active = true');
    if (category && category.toLowerCase() !== 'all') {
      addFilter(where, params, 'COALESCE(category, \'Getting Started\')', category);
    }
    addFilter(where, params, 'question || \' \' || answer', req.query.search || req.query.q, false);
    const result = await client.query(
      `
      SELECT id, question, answer, COALESCE(category, 'Getting Started') AS category, display_order, is_active, created_at, updated_at
      FROM ticketing_system.faq_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY category ASC, display_order ASC, id ASC
      `,
      params
    );
    const faqs = result.rows.map(mapFaqEntry);
    const sections = groupFaqsByCategory(faqs);
    return res.status(200).json({
      faqs,
      data: faqs,
      faq_sections: sections,
      grouped_faqs: sections,
      categories: getFaqCategoryOptions(sections, category),
      active_category: category || sections[0]?.category || null,
      total_faqs: faqs.length,
      filtered_faqs: faqs.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/faqs/categories', async (req, res, next) => {
  try {
    const result = await client.query(`
      SELECT COALESCE(category, 'Getting Started') AS category, COUNT(*)::int AS count
      FROM ticketing_system.faq_entries
      WHERE ($1::boolean = true OR is_active = true)
      GROUP BY COALESCE(category, 'Getting Started')
      ORDER BY category
    `, [req.query.include_inactive === 'true']);

    return res.status(200).json({
      categories: result.rows.map((row, index) => ({
        value: row.category,
        label: row.category,
        count: row.count,
        active: index === 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/faqs', requireEditor, async (req, res, next) => {
  try {
    const question = cleanText(req.body?.question);
    const answer = cleanText(req.body?.answer);
    if (!question || !answer) return res.status(400).json({ message: 'question and answer are required' });
    const result = await client.query(
      `
      INSERT INTO ticketing_system.faq_entries
        (question, answer, category, display_order, is_active, created_by_user_id, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$6)
      RETURNING id, question, answer, category, display_order, is_active, created_at, updated_at
      `,
      [
        question,
        answer,
        cleanText(req.body?.category),
        Number.isInteger(Number(req.body?.display_order)) ? Number(req.body.display_order) : 0,
        parseBool(req.body?.is_active, true),
        parsePositiveInt(req.user?.id)
      ]
    );
    return res.status(201).json({ success: true, faq: mapFaqEntry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/faqs/:id', requireEditor, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid FAQ id is required' });
    const result = await client.query(
      `
      UPDATE ticketing_system.faq_entries
      SET question = COALESCE($2, question),
          answer = COALESCE($3, answer),
          category = COALESCE($4, category),
          display_order = COALESCE($5, display_order),
          is_active = COALESCE($6, is_active),
          updated_by_user_id = $7,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, question, answer, category, display_order, is_active, created_at, updated_at
      `,
      [
        id,
        cleanText(req.body?.question),
        cleanText(req.body?.answer),
        cleanText(req.body?.category),
        req.body?.display_order === undefined ? null : Number(req.body.display_order),
        req.body?.is_active === undefined ? null : parseBool(req.body.is_active),
        parsePositiveInt(req.user?.id)
      ]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'FAQ not found' });
    return res.status(200).json({ success: true, faq: mapFaqEntry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/faqs/:id', requireEditor, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid FAQ id is required' });
    const result = await client.query(
      `UPDATE ticketing_system.faq_entries SET is_active = false, updated_by_user_id = $2, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
      [id, parsePositiveInt(req.user?.id)]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'FAQ not found' });
    return res.status(200).json({ success: true, faq: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/user-guide', async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    const section = cleanText(req.query.section || req.query.category);
    if (req.query.include_inactive !== 'true') where.push('is_active = true');
    if (section && section.toLowerCase() !== 'all') {
      addFilter(where, params, 'COALESCE(section, \'Getting Started\')', section);
    }
    addFilter(where, params, 'title || \' \' || content', req.query.search || req.query.q, false);
    const result = await client.query(
      `
      SELECT id, title, slug, content, COALESCE(section, 'Getting Started') AS section, display_order, is_active, created_at, updated_at
      FROM ticketing_system.user_guide_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY section ASC, display_order ASC, id ASC
      `,
      params
    );
    const guides = result.rows.map(mapGuideEntry);
    const sections = groupGuidesBySection(guides);
    return res.status(200).json({
      guides,
      data: guides,
      guide_sections: sections,
      grouped_guides: sections,
      categories: getGuideSectionOptions(sections, section),
      sections: getGuideSectionOptions(sections, section),
      active_section: section || sections[0]?.section || null,
      total_guides: guides.length,
      filtered_guides: guides.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/user-guide/categories', async (req, res, next) => {
  try {
    const result = await client.query(`
      SELECT COALESCE(section, 'Getting Started') AS section, COUNT(*)::int AS count
      FROM ticketing_system.user_guide_entries
      WHERE ($1::boolean = true OR is_active = true)
      GROUP BY COALESCE(section, 'Getting Started')
      ORDER BY section
    `, [req.query.include_inactive === 'true']);

    return res.status(200).json({
      categories: result.rows.map((row, index) => ({
        value: row.section,
        label: row.section,
        count: row.count,
        active: index === 0
      })),
      sections: result.rows.map((row, index) => ({
        value: row.section,
        label: row.section,
        count: row.count,
        active: index === 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/user-guide/:slug', async (req, res, next) => {
  try {
    const slug = cleanText(req.params.slug);
    if (!slug) return res.status(400).json({ message: 'Guide slug is required' });
    const result = await client.query(
      `
      SELECT id, title, slug, content, section, display_order, is_active, created_at, updated_at
      FROM ticketing_system.user_guide_entries
      WHERE slug = $1 AND ($2::boolean = true OR is_active = true)
      `,
      [slug, req.query.include_inactive === 'true']
    );
    if (!result.rows.length) return res.status(404).json({ message: 'User guide entry not found' });
    return res.status(200).json({ guide: mapGuideEntry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post('/user-guide', requireEditor, async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title || req.body?.question);
    const content = cleanText(req.body?.content || req.body?.answer || req.body?.description);
    const slug = cleanText(req.body?.slug) || slugify(title);
    if (!title || !content || !slug) return res.status(400).json({ message: 'title and content are required' });
    const result = await client.query(
      `
      INSERT INTO ticketing_system.user_guide_entries
        (title, slug, content, section, display_order, is_active, created_by_user_id, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      RETURNING id, title, slug, content, section, display_order, is_active, created_at, updated_at
      `,
      [
        title,
        slug,
        content,
        cleanText(req.body?.section || req.body?.category),
        Number.isInteger(Number(req.body?.display_order)) ? Number(req.body.display_order) : 0,
        parseBool(req.body?.is_active, true),
        parsePositiveInt(req.user?.id)
      ]
    );
    return res.status(201).json({ success: true, guide: mapGuideEntry(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ message: 'Guide slug already exists' });
    next(error);
  }
});

router.patch('/user-guide/:id', requireEditor, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid guide id is required' });
    const result = await client.query(
      `
      UPDATE ticketing_system.user_guide_entries
      SET title = COALESCE($2, title),
          slug = COALESCE($3, slug),
          content = COALESCE($4, content),
          section = COALESCE($5, section),
          display_order = COALESCE($6, display_order),
          is_active = COALESCE($7, is_active),
          updated_by_user_id = $8,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, title, slug, content, section, display_order, is_active, created_at, updated_at
      `,
      [
        id,
        cleanText(req.body?.title || req.body?.question),
        cleanText(req.body?.slug),
        cleanText(req.body?.content || req.body?.answer || req.body?.description),
        cleanText(req.body?.section || req.body?.category),
        req.body?.display_order === undefined ? null : Number(req.body.display_order),
        req.body?.is_active === undefined ? null : parseBool(req.body.is_active),
        parsePositiveInt(req.user?.id)
      ]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'User guide entry not found' });
    return res.status(200).json({ success: true, guide: mapGuideEntry(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ message: 'Guide slug already exists' });
    next(error);
  }
});

router.delete('/user-guide/:id', requireEditor, async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid guide id is required' });
    const result = await client.query(
      `UPDATE ticketing_system.user_guide_entries SET is_active = false, updated_by_user_id = $2, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
      [id, parsePositiveInt(req.user?.id)]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'User guide entry not found' });
    return res.status(200).json({ success: true, guide: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
