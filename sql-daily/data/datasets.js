// The databases players query. Each dataset is plain SQL that builds and fills its tables.
// A fresh copy is created for every query, so players can't break it (even with DELETE or DROP).
//
// To add a dataset: add a new key below, then set `dataset: '<key>'` on the questions that use it.

export const datasets = {
  shop: `
    CREATE TABLE customers (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      city        TEXT NOT NULL,
      signup_date TEXT NOT NULL
    );
    INSERT INTO customers VALUES
      (1,  'Ava Thompson',  'Seattle',  '2024-01-15'),
      (2,  'Ben Carter',    'Portland', '2024-02-03'),
      (3,  'Chloe Nguyen',  'Seattle',  '2024-02-20'),
      (4,  'Diego Ramirez', 'Denver',   '2024-03-11'),
      (5,  'Emma Wilson',   'Austin',   '2024-04-02'),
      (6,  'Farah Khan',    'Denver',   '2024-05-19'),
      (7,  'George Liu',    'Portland', '2024-06-07'),
      (8,  'Hana Sato',     'Austin',   '2024-07-23'),
      (9,  'Isaac Brown',   'Seattle',  '2024-09-01'),
      (10, 'Julia Rossi',   'Boston',   '2024-10-14');

    CREATE TABLE products (
      id       INTEGER PRIMARY KEY,
      name     TEXT NOT NULL,
      category TEXT NOT NULL,
      price    REAL NOT NULL
    );
    INSERT INTO products VALUES
      (1,  'Trail Backpack',              'Outdoors',    89.99),
      (2,  'Water Bottle',                'Outdoors',    14.50),
      (3,  'Camping Stove',               'Outdoors',    64.00),
      (4,  'Wireless Mouse',              'Electronics', 24.99),
      (5,  'Mechanical Keyboard',         'Electronics', 119.50),
      (6,  'USB-C Cable',                 'Electronics', 9.99),
      (7,  'Desk Lamp',                   'Home',        39.95),
      (8,  'Coffee Mug',                  'Home',        12.00),
      (9,  'Throw Blanket',               'Home',        45.00),
      (10, 'Noise-Cancelling Headphones', 'Electronics', 199.00),
      (11, 'Hammock',                     'Outdoors',    55.00);

    CREATE TABLE orders (
      id          INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_date  TEXT NOT NULL,
      status      TEXT NOT NULL  -- 'shipped', 'pending' or 'cancelled'
    );
    INSERT INTO orders VALUES
      (1,  1, '2024-03-02', 'shipped'),
      (2,  2, '2024-03-15', 'shipped'),
      (3,  1, '2024-04-10', 'shipped'),
      (4,  3, '2024-04-22', 'cancelled'),
      (5,  4, '2024-05-05', 'shipped'),
      (6,  5, '2024-05-30', 'shipped'),
      (7,  2, '2024-06-12', 'pending'),
      (8,  6, '2024-07-01', 'shipped'),
      (9,  7, '2024-07-19', 'shipped'),
      (10, 3, '2024-08-08', 'shipped'),
      (11, 8, '2024-09-14', 'shipped'),
      (12, 1, '2024-10-03', 'pending'),
      (13, 9, '2024-10-21', 'shipped'),
      (14, 5, '2024-11-11', 'cancelled'),
      (15, 4, '2024-12-02', 'shipped');

    CREATE TABLE order_items (
      order_id   INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL
    );
    INSERT INTO order_items VALUES
      (1, 1, 1), (1, 2, 2),
      (2, 5, 1), (2, 6, 3),
      (3, 8, 1),
      (4, 10, 1),
      (5, 3, 1), (5, 2, 1),
      (6, 7, 1), (6, 9, 1),
      (7, 4, 2),
      (8, 10, 1), (8, 6, 2),
      (9, 1, 1),
      (10, 5, 1), (10, 4, 1),
      (11, 8, 2), (11, 7, 1),
      (12, 2, 3),
      (13, 10, 1),
      (14, 9, 1),
      (15, 3, 1), (15, 1, 1), (15, 2, 2);

    CREATE TABLE employees (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      department TEXT NOT NULL,
      manager_id INTEGER REFERENCES employees(id),  -- NULL for the CEO
      salary     INTEGER NOT NULL,
      hire_date  TEXT NOT NULL
    );
    INSERT INTO employees VALUES
      (1,  'Maria Lopez',  'Executive',   NULL, 180000, '2018-01-10'),
      (2,  'Tom Becker',   'Engineering', 1,    150000, '2019-03-01'),
      (3,  'Priya Shah',   'Engineering', 2,    120000, '2020-06-15'),
      (4,  'Leo Martin',   'Engineering', 2,    115000, '2021-09-20'),
      (5,  'Nina Petrova', 'Sales',       1,    130000, '2019-05-12'),
      (6,  'Sam Okafor',   'Sales',       5,    85000,  '2022-01-03'),
      (7,  'Grace Kim',    'Sales',       5,    92000,  '2021-11-08'),
      (8,  'Omar Haddad',  'Support',     1,    90000,  '2020-02-17'),
      (9,  'Lily Chen',    'Support',     8,    62000,  '2023-04-25'),
      (10, 'Ryan Scott',   'Engineering', 3,    98000,  '2023-08-14');
  `,
};
