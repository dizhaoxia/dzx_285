const knex = require('knex');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db;

function getDbPath() {
  return path.join(__dirname, '..', '..', 'data', 'finance.db');
}

function ensureDbDir() {
  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return dbPath;
}

function initKnex() {
  const dbPath = ensureDbDir();
  console.log('数据库路径:', dbPath);
  
  db = knex({
    client: 'better-sqlite3',
    connection: {
      filename: dbPath
    },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      acquireTimeoutMillis: 60000,
      afterCreate: (conn, done) => {
        try {
          conn.pragma('foreign_keys = ON');
          done(null, conn);
        } catch (err) {
          done(err, conn);
        }
      }
    }
  });

  return db;
}

async function createTableIfNotExists(tableName, createFn) {
  const exists = await db.schema.hasTable(tableName);
  if (!exists) {
    await db.schema.createTable(tableName, createFn);
  }
}

async function createTables() {
  if (!db) {
    initKnex();
  }

  await createTableIfNotExists('accounts', function(table) {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.decimal('balance', 12, 2).notNullable().defaultTo(0);
    table.enu('type', ['cash', 'bank', 'credit', 'investment']).notNullable();
    table.string('description');
    table.string('currency').defaultTo('CNY');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
  });

  await createTableIfNotExists('tags', function(table) {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.string('color').defaultTo('#3b82f6');
    table.timestamp('created_at').defaultTo(db.fn.now());
  });

  await createTableIfNotExists('transactions', function(table) {
    table.increments('id').primary();
    table.enu('type', ['income', 'expense']).notNullable();
    table.decimal('amount', 12, 2).notNullable();
    table.timestamp('date').notNullable();
    table.string('category').notNullable();
    table.text('note');
    table.integer('account_id').unsigned().notNullable();
    table.foreign('account_id').references('accounts.id').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
    table.index('account_id');
    table.index('date');
    table.index('category');
  });

  await createTableIfNotExists('transaction_tags', function(table) {
    table.increments('id').primary();
    table.integer('transaction_id').unsigned().notNullable();
    table.integer('tag_id').unsigned().notNullable();
    table.foreign('transaction_id').references('transactions.id').onDelete('CASCADE');
    table.foreign('tag_id').references('tags.id').onDelete('CASCADE');
    table.unique(['transaction_id', 'tag_id']);
  });

  await createTableIfNotExists('attachments', function(table) {
    table.increments('id').primary();
    table.string('original_name').notNullable();
    table.string('file_path').notNullable();
    table.string('file_type');
    table.integer('file_size');
    table.integer('transaction_id').unsigned().notNullable();
    table.foreign('transaction_id').references('transactions.id').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.index('transaction_id');
  });

  await createTableIfNotExists('budgets', function(table) {
    table.increments('id').primary();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('total_amount', 12, 2).notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
    table.unique(['year', 'month']);
  });

  await createTableIfNotExists('category_budgets', function(table) {
    table.increments('id').primary();
    table.integer('budget_id').unsigned().notNullable();
    table.foreign('budget_id').references('budgets.id').onDelete('CASCADE');
    table.string('category').notNullable();
    table.decimal('amount', 12, 2).notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
    table.unique(['budget_id', 'category']);
    table.index('budget_id');
  });

  await createTableIfNotExists('exchange_rates', function(table) {
    table.increments('id').primary();
    table.string('base_currency', 3).notNullable();
    table.string('target_currency', 3).notNullable();
    table.decimal('rate', 18, 6).notNullable();
    table.string('source').notNullable().defaultTo('manual');
    table.timestamp('rate_date').notNullable();
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.unique(['base_currency', 'target_currency', 'rate_date']);
    table.index(['base_currency', 'target_currency']);
  });

  await createTableIfNotExists('settings', function(table) {
    table.increments('id').primary();
    table.string('key').notNullable().unique();
    table.text('value');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
  });

  await createTableIfNotExists('backups', function(table) {
    table.increments('id').primary();
    table.string('file_path').notNullable();
    table.string('file_name').notNullable();
    table.bigInteger('file_size').notNullable();
    table.boolean('is_encrypted').notNullable().defaultTo(false);
    table.boolean('is_compressed').notNullable().defaultTo(false);
    table.string('checksum');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.index('created_at');
  });

  await createTableIfNotExists('currencies', function(table) {
    table.increments('id').primary();
    table.string('code', 3).notNullable().unique();
    table.string('name').notNullable();
    table.string('symbol').notNullable();
    table.integer('decimal_places').notNullable().defaultTo(2);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(db.fn.now());
  });
}

async function initDatabase() {
  initKnex();
  await createTables();
  console.log('数据库初始化完成');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

async function close() {
  if (db) {
    await db.destroy();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDb,
  getDbPath,
  close
};
