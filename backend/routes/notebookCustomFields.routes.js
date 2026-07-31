const express = require('express');
const router = express.Router();
const client = require('../connection');

const MAX_LIMIT = 100;
const FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'special'];

// Every notebook's custom fields become real columns on that notebook's own backend
// table (per explicit customer requirement), keyed by the notebook name exactly as
// stored on notebook_custom_fields.notebook. linkColumn is the column used to match a
// row to the entryId the frontend already threads through every notebook form.
// Verified directly against the live DB: every table below has an entry_id column
// (nullable, but backed by a UNIQUE index) except carding.inspections, which uses its
// own text primary key column "id" as the entry id.
const NOTEBOOK_TABLE_MAP = {
  'cotton hvi data entry': { schema: 'mixing', table: 'cotton_hvi_data_entry', linkColumn: 'entry_id' },
  'afis data entry': { schema: 'mixing', table: 'afis_data_entry', linkColumn: 'entry_id' },
  'afis-6 cotton data entry': { schema: 'mixing', table: 'afis6_cotton_data_entry', linkColumn: 'entry_id' },
  'afis-6 mmf data entry': { schema: 'mixing', table: 'afis6_mmf_data_entry', linkColumn: 'entry_id' },
  'fibre data entry': { schema: 'mixing', table: 'fibre_data_entry', linkColumn: 'entry_id' },
  'moisture data entry': { schema: 'mixing', table: 'moisture_data_entry', linkColumn: 'entry_id' },
  'openness data entry': { schema: 'mixing', table: 'openness_inspection', linkColumn: 'entry_id' },
  'blow room sync': { schema: 'blowroom', table: 'blow_room_sync', linkColumn: 'entry_id' },
  'br waste study entry': { schema: 'blowroom', table: 'br_waste_study', linkColumn: 'entry_id' },
  'drop test data entry': { schema: 'blowroom', table: 'drop_test', linkColumn: 'entry_id' },
  'b/r cv1m data entry within lap': { schema: 'blowroom', table: 'within_lap_cv', linkColumn: 'entry_id' },
  'b/r between lap cv%': { schema: 'blowroom', table: 'between_lap_cv', linkColumn: 'entry_id' },
  'between & within card data entry': { schema: 'carding', table: 'inspections', linkColumn: 'id' },
  'thick place & cv': { schema: 'carding', table: 'card_thick_place_header', linkColumn: 'entry_id' },
  'carding nre%': { schema: 'carding', table: 'nre', linkColumn: 'entry_id' },
  'nati data entry::carding': { schema: 'carding', table: 'nati_data_entry', linkColumn: 'entry_id' },
  'u% data entry::carding': { schema: 'carding', table: 'u_data_entry', linkColumn: 'entry_id' },
  // Card DFK Data intentionally excluded: carding.card_dfk_pressure_checking stores many
  // rows (one per machine/reading) under the same shared entry_id with no unique
  // constraint possible, so it stays on the generic notebook_custom_field_values side-table.
  'wheelchange': { schema: 'carding', table: 'carding_change_request', linkColumn: 'entry_id' },
  'individual card waste study': { schema: 'carding', table: 'card_waste_study', linkColumn: 'entry_id' },
  '1 yard / half yard cv entry': { schema: 'drawframe', table: 'yarn_cv_percent', linkColumn: 'entry_id' },
  'draw frame cots data entry': { schema: 'drawframe', table: 'cots_data_entry', linkColumn: 'entry_id' },
  'u% data entry::draw frame': { schema: 'drawframe', table: 'u_data_entry', linkColumn: 'entry_id' },
  // Draw Frame's 7 Wheel Change sub-types all share ONE table (drawframe.wheel_change,
  // differentiated by its wheel_change_type column) — unlike Spinning's Wheel Change, which has
  // 3 separate tables. Each sub-type still gets its own notebook name so a field can be scoped to
  // showing on just that sub-type's screen, but they all resolve to the same table/columns.
  'wheel change - type 1 (sb20)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 2 (td7)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 3 (td9)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 1 (lrsb)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 2 (d40)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 3 (d50/d55)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'wheel change - type 4 (ldf3s)': { schema: 'drawframe', table: 'wheel_change', linkColumn: 'entry_id' },
  'smxcots change data entry': { schema: 'simplex', table: 'simplex_inspections', linkColumn: 'entry_id' },
  'smx breaks study report': { schema: 'simplex', table: 'smx_breaks_study_header', linkColumn: 'entry_id' },
  'u% data entry::simplex': { schema: 'simplex', table: 'u_data_entry', linkColumn: 'entry_id' },
  'wheel change::simplex': { schema: 'simplex', table: 'wheel_change', linkColumn: 'entry_id' },
  'process parameter': { schema: 'spinning', table: 'spinning_qc_header', linkColumn: 'entry_id' },
  'cots checking': { schema: 'spinning', table: 'cots_checking', linkColumn: 'entry_id' },
  'count change': { schema: 'spinning', table: 'count_change_inspections', linkColumn: 'entry_id' },
  'ring frame log book': { schema: 'spinning', table: 'ring_frame_inspections', linkColumn: 'entry_id' },
  'speed checking': { schema: 'spinning', table: 'speed_checking', linkColumn: 'entry_id' },
  'bottom apron checking': { schema: 'spinning', table: 'bottom_apron_checking', linkColumn: 'entry_id' },
  'lycra out of centering': { schema: 'spinning', table: 'lycra_centering', linkColumn: 'entry_id' },
  'rsm & lycrasensor checking online': { schema: 'spinning', table: 'rsm_and_lycrasensor_cheking_online', linkColumn: 'entry_id' },
  'rsm & lycrasensor checking offline': { schema: 'spinning', table: 'rsm_and_lycrasensor_cheking_offline', linkColumn: 'entry_id' },
  // Spinning's Wheel Change (unlike Draw Frame/Simplex) has 3 sub-types that each write to
  // their own table, so each sub-type gets its own notebook name/mapping instead of a single
  // 'wheel change::spinning' entry.
  'wheel change - type 1': { schema: 'spinning', table: 'wheel_change_inspection', linkColumn: 'entry_id' },
  'wheel change - type 2': { schema: 'spinning', table: 'wheel_change_v2', linkColumn: 'entry_id' },
  'wheel change - type 3': { schema: 'spinning', table: 'wheel_change', linkColumn: 'entry_id' },
  'rewinding study': { schema: 'autoconer', table: 'inspection_data_entry', linkColumn: 'entry_id' },
  'cone density': { schema: 'autoconer', table: 'cone_density_notebook', linkColumn: 'entry_id' },
  'cone packing audit': { schema: 'autoconer', table: 'cone_packing_audit', linkColumn: 'entry_id' },
  'lycra% checking': { schema: 'autoconer', table: 'lycra_checking_inspections', linkColumn: 'entry_id' },
  'count wise cuts record': { schema: 'autoconer', table: 'count_wise_cuts', linkColumn: 'entry_id' },
  'splice strength': { schema: 'autoconer', table: 'inspections', linkColumn: 'entry_id' },
  'drum wise appearance': { schema: 'autoconer', table: 'drum_wise', linkColumn: 'entry_id' },
  'csp parameter entries': { schema: 'autoconer', table: 'parameter_entries', linkColumn: 'entry_id' },
  'u% parameter entries': { schema: 'autoconer', table: 'parameter_entries', linkColumn: 'entry_id' },
  'ribbon lap cv1m data entry': { schema: 'comber', table: 'ribbon_lap_cv_qc', linkColumn: 'entry_id' },
  'nati data entry::comber': { schema: 'comber', table: 'nati_data_entry', linkColumn: 'entry_id' },
  'u% data entry::comber': { schema: 'comber', table: 'u_data_entry', linkColumn: 'entry_id' },
  'comber nre%': { schema: 'comber', table: 'nre_data_entry', linkColumn: 'entry_id' },
  'comber efficiency': { schema: 'comber', table: 'efficiency_data_entry', linkColumn: 'entry_id' },
  'individual card performance data': { schema: 'trials', table: 'trials', linkColumn: 'entry_id' },
};

// "Nati Data Entry", "U% Data Entry" and "Wheel Change" are reused notebook names across
// multiple sub-departments, each backed by a different table — so lookups must be keyed
// by (sub_department, notebook), not notebook alone. Fall back to plain notebook lookup
// for names that are unique across the whole app.
const AMBIGUOUS_NOTEBOOK_SUB_DEPARTMENTS = {
  'nati data entry': { carding: 'nati data entry::carding', comber: 'nati data entry::comber' },
  'u% data entry': {
    carding: 'u% data entry::carding',
    'draw frame': 'u% data entry::draw frame',
    simplex: 'u% data entry::simplex',
    comber: 'u% data entry::comber',
  },
  'wheel change': {
    simplex: 'wheel change::simplex',
  },
};

const resolveNotebookTableConfig = (notebook, subDepartment) => {
  const notebookKey = String(notebook ?? '').trim().toLowerCase();
  const subDeptKey = String(subDepartment ?? '').trim().toLowerCase();

  const disambiguated = AMBIGUOUS_NOTEBOOK_SUB_DEPARTMENTS[notebookKey];
  if (disambiguated) {
    const resolvedKey = disambiguated[subDeptKey];
    return resolvedKey ? NOTEBOOK_TABLE_MAP[resolvedKey] : null;
  }

  return NOTEBOOK_TABLE_MAP[notebookKey] || null;
};

// Column identifiers can't be parameterized in SQL, so we generate them ourselves from
// a strict allow-listed slug (lowercase ascii letters, digits, underscore only) instead
// of trusting the client-supplied label directly.
const slugifyColumnName = (label) => {
  const slug = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return slug || 'field';
};

const isSafeColumnIdentifier = (name) => /^[a-z_][a-z0-9_]{0,62}$/.test(name);

const columnExistsOnTable = async (schema, table, columnName) => {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, columnName]
  );
  return result.rows.length > 0;
};

const buildUniqueColumnName = async (schema, table, baseSlug, excludeFieldId = null) => {
  let candidate = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const alreadyOnTable = await columnExistsOnTable(schema, table, candidate);
    if (!alreadyOnTable) {
      const existing = await client.query(
        `SELECT id FROM ticketing_system.notebook_custom_fields
         WHERE db_column_name = $1 AND db_table_name = $2 AND ($3::bigint IS NULL OR id <> $3)`,
        [candidate, `${schema}.${table}`, excludeFieldId]
      );
      if (existing.rows.length === 0) return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}_${suffix}`.slice(0, 63);
  }
};

const SQL_TYPE_BY_FIELD_TYPE = {
  number: 'NUMERIC',
  date: 'DATE',
  text: 'TEXT',
  dropdown: 'TEXT',
  special: 'TEXT',
};

const DEFAULT_LITERAL_BY_FIELD_TYPE = {
  number: '0',
  date: 'NULL',
  text: 'NULL',
  dropdown: 'NULL',
  special: 'NULL',
};

const ensureNotebookCustomFieldsDbColumnSupport = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.notebook_custom_fields
      ADD COLUMN IF NOT EXISTS db_column_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS db_table_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS decimal_places INTEGER NULL
  `);
};

const MAX_DECIMAL_PLACES = 6;

const parseDecimalPlaces = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DECIMAL_PLACES) return null;
  return n;
};

// schema/table always come from NOTEBOOK_TABLE_MAP (a hardcoded constant below, never
// user input), but we validate them as identifiers anyway as defense in depth before
// they're interpolated into DDL.
const assertSafeTableRef = (schema, table) => {
  if (!isSafeColumnIdentifier(schema) || !isSafeColumnIdentifier(table)) {
    throw new Error(`Unsafe table reference: ${schema}.${table}`);
  }
};

const addDynamicColumn = async (fieldId, fieldLabel, fieldType, schema, table, decimalPlaces = null) => {
  assertSafeTableRef(schema, table);
  const baseSlug = slugifyColumnName(fieldLabel);
  const columnName = await buildUniqueColumnName(schema, table, baseSlug, fieldId);

  if (!isSafeColumnIdentifier(columnName)) {
    throw new Error('Generated column name failed safety validation');
  }

  const baseSqlType = SQL_TYPE_BY_FIELD_TYPE[fieldType] || 'TEXT';
  const sqlType = fieldType === 'number' && Number.isInteger(decimalPlaces)
    ? `NUMERIC(18, ${decimalPlaces})`
    : baseSqlType;
  const defaultLiteral = DEFAULT_LITERAL_BY_FIELD_TYPE[fieldType] || "''";
  const tableRef = `"${schema}"."${table}"`;

  await client.query(
    `ALTER TABLE ${tableRef}
       ADD COLUMN IF NOT EXISTS "${columnName}" ${sqlType} DEFAULT ${defaultLiteral}`
  );

  await client.query(
    `UPDATE ${tableRef} SET "${columnName}" = ${defaultLiteral} WHERE "${columnName}" IS NULL`
  );

  await client.query(
    `UPDATE ticketing_system.notebook_custom_fields SET db_column_name = $1, db_table_name = $2 WHERE id = $3`,
    [columnName, `${schema}.${table}`, fieldId]
  );

  return columnName;
};

const setDynamicColumnDefault = async (dbTableName, columnName, fieldType, activate) => {
  if (!columnName || !isSafeColumnIdentifier(columnName) || !dbTableName) return;
  const [schema, table] = dbTableName.split('.');
  assertSafeTableRef(schema, table);

  const defaultLiteral = activate
    ? (DEFAULT_LITERAL_BY_FIELD_TYPE[fieldType] || 'NULL')
    : (fieldType === 'number' ? '0' : 'NULL');

  await client.query(
    `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultLiteral}`
  );
};

const dropDynamicColumn = async (dbTableName, columnName) => {
  if (!columnName || !isSafeColumnIdentifier(columnName) || !dbTableName) return;
  const [schema, table] = dbTableName.split('.');
  assertSafeTableRef(schema, table);
  await client.query(`ALTER TABLE "${schema}"."${table}" DROP COLUMN IF EXISTS "${columnName}"`);
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const parseFieldType = (value) => {
  const type = String(value ?? '').trim().toLowerCase();
  return FIELD_TYPES.includes(type) ? type : 'text';
};

const parseOptions = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const ensureNotebookCustomFieldsTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.notebook_custom_fields (
      id BIGSERIAL PRIMARY KEY,
      department TEXT NOT NULL,
      sub_department TEXT NOT NULL,
      notebook TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      field_options JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id INTEGER NULL,
      created_by_name TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notebook_custom_fields_lookup_idx
    ON ticketing_system.notebook_custom_fields
    (lower(trim(department)), lower(trim(sub_department)), lower(trim(notebook)))
  `);
};

const ensureNotebookCustomFieldValuesTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.notebook_custom_field_values (
      id BIGSERIAL PRIMARY KEY,
      custom_field_id BIGINT NOT NULL REFERENCES ticketing_system.notebook_custom_fields(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      value TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (custom_field_id, entry_id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notebook_custom_field_values_entry_idx
    ON ticketing_system.notebook_custom_field_values (entry_id)
  `);
};

router.post('/', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const department = cleanText(req.body?.department);
    const subDepartment = cleanText(req.body?.sub_department ?? req.body?.subDepartment);
    const notebook = cleanText(req.body?.notebook);
    const fieldLabel = cleanText(req.body?.field_label ?? req.body?.fieldLabel);
    const fieldType = parseFieldType(req.body?.field_type ?? req.body?.fieldType);
    const fieldOptions = fieldType === 'dropdown' ? parseOptions(req.body?.field_options ?? req.body?.fieldOptions) : [];
    const decimalPlaces = fieldType === 'number' ? parseDecimalPlaces(req.body?.decimal_places ?? req.body?.decimalPlaces) : null;
    const createdByUserId = parsePositiveInt(req.body?.created_by_user_id ?? req.user?.id);
    const createdByName = cleanText(req.body?.created_by_name ?? req.user?.full_name);

    if (!department || !subDepartment || !notebook) {
      return res.status(400).json({ error: 'department, sub_department and notebook are required' });
    }
    if (!fieldLabel) {
      return res.status(400).json({ error: 'field_label is required' });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.notebook_custom_fields
        (department, sub_department, notebook, field_label, field_type, field_options, decimal_places, created_by_user_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, department, sub_department, notebook, field_label, field_type, field_options,
                 is_active, decimal_places, created_by_user_id, created_by_name, created_at, updated_at`,
      [department, subDepartment, notebook, fieldLabel, fieldType, JSON.stringify(fieldOptions), decimalPlaces, createdByUserId, createdByName]
    );

    let field = result.rows[0];

    const tableConfig = resolveNotebookTableConfig(notebook, subDepartment);
    if (tableConfig) {
      const columnName = await addDynamicColumn(field.id, fieldLabel, fieldType, tableConfig.schema, tableConfig.table, decimalPlaces);
      field = { ...field, db_column_name: columnName, db_table_name: `${tableConfig.schema}.${tableConfig.table}` };
    }

    res.status(201).json({
      message: 'Field created successfully',
      field,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const { department, sub_department: subDepartment, notebook, status } = req.query;
    const page = parsePositiveInt(req.query?.page, 1);
    const limit = Math.min(parsePositiveInt(req.query?.limit, 50), MAX_LIMIT);
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    if (department) {
      values.push(department);
      conditions.push(`LOWER(TRIM(department)) = LOWER(TRIM($${values.length}))`);
    }
    if (subDepartment) {
      values.push(subDepartment);
      conditions.push(`LOWER(TRIM(sub_department)) = LOWER(TRIM($${values.length}))`);
    }
    if (notebook) {
      values.push(notebook);
      conditions.push(`LOWER(TRIM(notebook)) = LOWER(TRIM($${values.length}))`);
    }
    if (status === 'active') {
      conditions.push('is_active = true');
    } else if (status === 'inactive') {
      conditions.push('is_active = false');
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT id, department, sub_department, notebook, field_label, field_type, field_options,
              is_active, decimal_places, created_by_user_id, created_by_name, created_at, updated_at, db_column_name, db_table_name
       FROM ticketing_system.notebook_custom_fields
       ${whereClause}
       ORDER BY created_at DESC
       OFFSET $${values.length + 1} LIMIT $${values.length + 2}`,
      [...values, offset, limit]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM ticketing_system.notebook_custom_fields ${whereClause}`,
      values
    );

    res.status(200).json({
      fields: result.rows,
      total: parseInt(total.rows[0].count, 10),
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const { id } = req.params;
    const fieldLabel = cleanText(req.body?.field_label ?? req.body?.fieldLabel);
    let fieldType = parseFieldType(req.body?.field_type ?? req.body?.fieldType);
    const fieldOptions = fieldType === 'dropdown' ? parseOptions(req.body?.field_options ?? req.body?.fieldOptions) : [];
    let decimalPlaces = fieldType === 'number' ? parseDecimalPlaces(req.body?.decimal_places ?? req.body?.decimalPlaces) : null;

    if (!fieldLabel) {
      return res.status(400).json({ error: 'field_label is required' });
    }

    const existing = await client.query(
      `SELECT field_type, db_column_name, decimal_places FROM ticketing_system.notebook_custom_fields WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }

    const hasDbColumn = Boolean(existing.rows[0].db_column_name);
    if (hasDbColumn && fieldType !== existing.rows[0].field_type) {
      return res.status(400).json({
        error: 'This field already has a database column and its type cannot be changed. Create a new field instead.',
      });
    }
    if (hasDbColumn && fieldType === 'number' && decimalPlaces !== existing.rows[0].decimal_places) {
      return res.status(400).json({
        error: 'This field already has a database column and its decimal places cannot be changed. Create a new field instead.',
      });
    }
    if (hasDbColumn) {
      fieldType = existing.rows[0].field_type;
      decimalPlaces = existing.rows[0].decimal_places;
    }

    const result = await client.query(
      `UPDATE ticketing_system.notebook_custom_fields
       SET field_label = $1, field_type = $2, field_options = $3, decimal_places = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, department, sub_department, notebook, field_label, field_type, field_options,
                 is_active, decimal_places, created_by_user_id, created_by_name, created_at, updated_at`,
      [fieldLabel, fieldType, JSON.stringify(fieldOptions), decimalPlaces, id]
    );

    res.status(200).json({
      message: 'Field updated successfully',
      field: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const { id } = req.params;

    const existing = await client.query(
      `SELECT id, notebook, db_column_name, db_table_name FROM ticketing_system.notebook_custom_fields WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }

    const fieldBeforeDelete = existing.rows[0];

    const result = await client.query(
      `DELETE FROM ticketing_system.notebook_custom_fields
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (fieldBeforeDelete.db_table_name) {
      await dropDynamicColumn(fieldBeforeDelete.db_table_name, fieldBeforeDelete.db_column_name);
    }

    res.status(200).json({
      message: 'Field deleted successfully',
      field: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldValuesTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const { id } = req.params;
    const result = await client.query(
      `UPDATE ticketing_system.notebook_custom_fields
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, department, sub_department, notebook, field_label, field_type, field_options,
                 is_active, created_by_user_id, created_by_name, created_at, updated_at, db_column_name, db_table_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }

    const field = result.rows[0];

    if (field.db_table_name) {
      // Real column: leave historical values untouched, just change what future
      // rows default to (blank/0) while the field is inactive.
      await setDynamicColumnDefault(field.db_table_name, field.db_column_name, field.field_type, field.is_active);
    } else if (!field.is_active) {
      await client.query(
        `UPDATE ticketing_system.notebook_custom_field_values
         SET value = '0', updated_at = NOW()
         WHERE custom_field_id = $1`,
        [id]
      );
    }

    res.status(200).json({
      message: 'Field status toggled successfully',
      field,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/values', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldValuesTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const entryId = cleanText(req.query?.entry_id ?? req.query?.entryId);
    if (!entryId) {
      return res.status(400).json({ error: 'entry_id is required' });
    }

    const sideTableResult = await client.query(
      `SELECT custom_field_id, entry_id, value
       FROM ticketing_system.notebook_custom_field_values
       WHERE entry_id = $1`,
      [entryId]
    );
    const rows = [...sideTableResult.rows];

    const dynamicFields = await client.query(
      `SELECT id, notebook, db_column_name, db_table_name FROM ticketing_system.notebook_custom_fields
       WHERE db_column_name IS NOT NULL AND db_table_name IS NOT NULL`
    );

    // Group by table so each notebook's underlying table is queried once, using that
    // table's own link column (usually entry_id, but e.g. carding.inspections uses id).
    const fieldsByTable = new Map();
    for (const f of dynamicFields.rows) {
      if (!isSafeColumnIdentifier(f.db_column_name)) continue;
      if (!fieldsByTable.has(f.db_table_name)) fieldsByTable.set(f.db_table_name, []);
      fieldsByTable.get(f.db_table_name).push(f);
    }

    for (const [dbTableName, fields] of fieldsByTable) {
      const [schema, table] = dbTableName.split('.');
      if (!isSafeColumnIdentifier(schema) || !isSafeColumnIdentifier(table)) continue;

      const linkColumn = resolveNotebookTableConfig(fields[0]?.notebook, '')?.linkColumn || 'entry_id';
      if (!isSafeColumnIdentifier(linkColumn)) continue;

      const selectList = fields.map((f) => `"${f.db_column_name}"`).join(', ');
      const tableResult = await client.query(
        `SELECT ${selectList} FROM "${schema}"."${table}" WHERE "${linkColumn}" = $1 LIMIT 1`,
        [entryId]
      );
      if (!tableResult.rows.length) continue;

      const row = tableResult.rows[0];
      fields.forEach((f) => {
        rows.push({
          custom_field_id: f.id,
          entry_id: entryId,
          value: row[f.db_column_name] === null || row[f.db_column_name] === undefined
            ? null
            : String(row[f.db_column_name]),
        });
      });
    }

    res.status(200).json({ values: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/values', async (req, res) => {
  try {
    await ensureNotebookCustomFieldsTable();
    await ensureNotebookCustomFieldValuesTable();
    await ensureNotebookCustomFieldsDbColumnSupport();

    const entryId = cleanText(req.body?.entry_id ?? req.body?.entryId);
    const values = req.body?.values;

    if (!entryId) {
      return res.status(400).json({ error: 'entry_id is required' });
    }
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: 'values must be an array of { custom_field_id, value }' });
    }

    const customFieldIds = values
      .map((item) => parsePositiveInt(item?.custom_field_id ?? item?.customFieldId))
      .filter(Boolean);

    const fieldDefs = customFieldIds.length
      ? await client.query(
          `SELECT id, notebook, db_column_name, db_table_name FROM ticketing_system.notebook_custom_fields WHERE id = ANY($1::bigint[])`,
          [customFieldIds]
        )
      : { rows: [] };
    const fieldDefById = new Map(fieldDefs.rows.map((f) => [String(f.id), f]));

    const rows = [];
    // Group dynamic-column updates by their underlying table, since different
    // notebooks' custom fields can live on different tables (or none, for side-table
    // notebooks) in the same request.
    const dynamicColumnUpdatesByTable = new Map();

    for (const item of values) {
      const customFieldId = parsePositiveInt(item?.custom_field_id ?? item?.customFieldId);
      if (!customFieldId) continue;
      const rawValue = item?.value === undefined || item?.value === null ? '' : String(item.value);
      const value = rawValue.trim() === '' ? null : rawValue;
      const fieldDef = fieldDefById.get(String(customFieldId));

      if (fieldDef && fieldDef.db_table_name && fieldDef.db_column_name && isSafeColumnIdentifier(fieldDef.db_column_name)) {
        if (!dynamicColumnUpdatesByTable.has(fieldDef.db_table_name)) {
          dynamicColumnUpdatesByTable.set(fieldDef.db_table_name, {});
        }
        dynamicColumnUpdatesByTable.get(fieldDef.db_table_name)[fieldDef.db_column_name] = value;
        rows.push({ custom_field_id: customFieldId, entry_id: entryId, value });
        continue;
      }

      const result = await client.query(
        `INSERT INTO ticketing_system.notebook_custom_field_values (custom_field_id, entry_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (custom_field_id, entry_id)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING custom_field_id, entry_id, value`,
        [customFieldId, entryId, value]
      );
      rows.push(result.rows[0]);
    }

    const updateWarnings = [];

    for (const [dbTableName, columnUpdates] of dynamicColumnUpdatesByTable) {
      const [schema, table] = dbTableName.split('.');
      if (!isSafeColumnIdentifier(schema) || !isSafeColumnIdentifier(table)) continue;

      // Resolve the link column from the notebook the field actually belongs to (not just any
      // map entry that happens to point at the same schema/table) — some tables (e.g.
      // autoconer.parameter_entries) are shared by more than one notebook, so guessing by
      // schema/table alone could silently pick the wrong notebook's config.
      const fieldOnThisTable = [...fieldDefById.values()].find((f) => f.db_table_name === dbTableName);
      const tableConfig = fieldOnThisTable
        ? resolveNotebookTableConfig(fieldOnThisTable.notebook, '')
        : null;
      const linkColumn = tableConfig?.linkColumn || 'entry_id';
      if (!isSafeColumnIdentifier(linkColumn)) continue;

      const columnNames = Object.keys(columnUpdates);
      if (!columnNames.length) continue;

      const setClause = columnNames.map((col, idx) => `"${col}" = $${idx + 2}`).join(', ');
      try {
        const updateResult = await client.query(
          `UPDATE "${schema}"."${table}" SET ${setClause} WHERE "${linkColumn}" = $1`,
          [entryId, ...columnNames.map((c) => columnUpdates[c])]
        );
        if (updateResult.rowCount === 0) {
          updateWarnings.push(
            `No row found in ${dbTableName} with ${linkColumn} = ${entryId} — value(s) for ${columnNames.join(', ')} were not saved.`
          );
        }
      } catch (updateError) {
        console.error(`Failed updating ${dbTableName} for entry_id ${entryId}:`, updateError);
        updateWarnings.push(
          `Could not save ${columnNames.join(', ')} on ${dbTableName}: ${updateError.message}`
        );
      }
    }

    if (updateWarnings.length) {
      return res.status(207).json({ message: 'Some field values were not saved', values: rows, warnings: updateWarnings });
    }

    res.status(200).json({ message: 'Field values saved successfully', values: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
