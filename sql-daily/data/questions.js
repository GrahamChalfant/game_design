// The question bank. Each day the game picks one easy, one medium and one hard question from here.
//
// Every question needs:
//   id           Unique, never changes once players have seen it (used for saved progress).
//   tier         'easy', 'medium' or 'hard'.
//   dataset      Which database from data/datasets.js the question runs against.
//   title        Short name shown above the question.
//   prompt       What the player has to do. Say exactly which columns to return, and the order
//                if it matters, so a correct idea isn't marked wrong on a technicality.
//   columns      The column names the answer should have (shown to the player as a guide).
//   orderMatters true if the rows must come back in a specific order (i.e. the prompt asks for one).
//   solution     A correct query. The player's result is compared to this query's result.
//   hints        One or more nudges, from gentle to more direct.
//   tests        (optional) Extra queries checked by `npm run validate`:
//                  accept: other correct answers that must be marked right
//                  reject: common mistakes that must be marked wrong
//
// After editing, run the validator (see README.md) to catch mistakes before players do.

export const questions = [
  // ---------------------------------------------------------------- EASY (100 pts)
  {
    id: 'seattle-customers',
    tier: 'easy',
    dataset: 'shop',
    title: 'Sleepless in Seattle',
    prompt: 'List the names of all customers who live in Seattle, in alphabetical order.',
    columns: ['name'],
    orderMatters: true,
    solution: `SELECT name FROM customers WHERE city = 'Seattle' ORDER BY name;`,
    hints: [
      'Filter rows with WHERE.',
      'Text values go in single quotes, and capital letters matter: WHERE city = \'Seattle\'.',
    ],
    tests: {
      accept: [`select c.name from customers c where c.city = 'Seattle' order by 1`],
      reject: [
        `SELECT name FROM customers WHERE city = 'seattle' ORDER BY name`,
        `SELECT name FROM customers ORDER BY name`,
        `SELECT name FROM customers WHERE city = 'Seattle' ORDER BY name DESC`,
      ],
    },
  },
  {
    id: 'cheap-products',
    tier: 'easy',
    dataset: 'shop',
    title: 'Bargain Bin',
    prompt: 'Show the name and price of every product that costs less than $30, cheapest first.',
    columns: ['name', 'price'],
    orderMatters: true,
    solution: `SELECT name, price FROM products WHERE price < 30 ORDER BY price;`,
    hints: ['Use WHERE price < 30.', 'ORDER BY sorts from smallest to largest by default.'],
    tests: {
      reject: [
        `SELECT name, price FROM products WHERE price < 30 ORDER BY price DESC`,
        `SELECT price, name FROM products WHERE price < 30 ORDER BY price`,
        `SELECT name FROM products WHERE price < 30 ORDER BY price`,
      ],
    },
  },
  {
    id: 'orders-by-status',
    tier: 'easy',
    dataset: 'shop',
    title: 'Status Report',
    prompt: 'How many orders are there with each status? Return the status and the number of orders.',
    columns: ['status', 'order_count'],
    orderMatters: false,
    solution: `SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status;`,
    hints: ['COUNT(*) counts rows.', 'GROUP BY status gives you one row per status.'],
    tests: {
      reject: [`SELECT status, COUNT(*) FROM orders`, `SELECT COUNT(*) FROM orders GROUP BY status`],
    },
  },
  {
    id: 'electronics-by-price',
    tier: 'easy',
    dataset: 'shop',
    title: 'Gadget Shelf',
    prompt: 'Show the name and price of every product in the Electronics category, most expensive first.',
    columns: ['name', 'price'],
    orderMatters: true,
    solution: `SELECT name, price FROM products WHERE category = 'Electronics' ORDER BY price DESC;`,
    hints: ['Filter on the category column.', 'Add DESC after ORDER BY to sort from largest to smallest.'],
    tests: {
      reject: [`SELECT name, price FROM products WHERE category = 'Electronics' ORDER BY price`],
    },
  },
  {
    id: 'recent-hires',
    tier: 'easy',
    dataset: 'shop',
    title: 'New Faces',
    prompt:
      'List the name and hire date of every employee hired on or after January 1, 2022, earliest hire first.',
    columns: ['name', 'hire_date'],
    orderMatters: true,
    solution: `SELECT name, hire_date FROM employees WHERE hire_date >= '2022-01-01' ORDER BY hire_date;`,
    hints: [
      'Dates here are stored as text like \'2022-01-01\', so you can compare them with >=.',
      'Sort with ORDER BY hire_date.',
    ],
    tests: {
      reject: [
        `SELECT name, hire_date FROM employees WHERE hire_date >= '2022-01-01' ORDER BY hire_date DESC`,
        `SELECT name, hire_date FROM employees WHERE hire_date > '2023-01-01' ORDER BY hire_date`,
      ],
    },
  },
  {
    id: 'customer-cities',
    tier: 'easy',
    dataset: 'shop',
    title: 'On the Map',
    prompt: 'List every city where we have at least one customer. Show each city only once, in alphabetical order.',
    columns: ['city'],
    orderMatters: true,
    solution: `SELECT DISTINCT city FROM customers ORDER BY city;`,
    hints: ['Some cities have several customers.', 'SELECT DISTINCT removes duplicate rows.'],
    tests: {
      accept: [`SELECT city FROM customers GROUP BY city ORDER BY city`],
      reject: [`SELECT city FROM customers ORDER BY city`],
    },
  },

  // ---------------------------------------------------------------- MEDIUM (200 pts)
  {
    id: 'orders-per-customer',
    tier: 'medium',
    dataset: 'shop',
    title: 'Regulars',
    prompt:
      'For every customer who has placed at least one order, show their name and how many orders they have placed.',
    columns: ['name', 'order_count'],
    orderMatters: false,
    solution: `
      SELECT c.name, COUNT(*) AS order_count
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name;`,
    hints: [
      'Customer names are in customers; orders are in orders. Join them on orders.customer_id = customers.id.',
      'Then GROUP BY the customer and COUNT the orders.',
    ],
    tests: {
      reject: [
        `SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id`,
        `SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id`,
      ],
    },
  },
  {
    id: 'gone-quiet',
    tier: 'medium',
    dataset: 'shop',
    title: 'Gone Quiet',
    prompt:
      'Which customers have NOT placed any order on or after July 1, 2024? Include customers who have never ordered at all. Return their names in alphabetical order.',
    columns: ['name'],
    orderMatters: true,
    solution: `
      SELECT name FROM customers
      WHERE id NOT IN (SELECT customer_id FROM orders WHERE order_date >= '2024-07-01')
      ORDER BY name;`,
    hints: [
      'First find the customers who DID order on or after 2024-07-01, then exclude them.',
      'Try WHERE id NOT IN (SELECT customer_id FROM orders WHERE ...).',
    ],
    tests: {
      accept: [
        `SELECT c.name FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id AND o.order_date >= '2024-07-01'
         WHERE o.id IS NULL ORDER BY c.name`,
      ],
      reject: [
        `SELECT DISTINCT c.name FROM customers c JOIN orders o ON o.customer_id = c.id
         WHERE o.order_date < '2024-07-01' ORDER BY c.name`,
      ],
    },
  },
  {
    id: 'category-avg-price',
    tier: 'medium',
    dataset: 'shop',
    title: 'Price Check',
    prompt:
      'For each product category, show the category and the average product price rounded to 2 decimal places. Highest average first.',
    columns: ['category', 'avg_price'],
    orderMatters: true,
    solution: `
      SELECT category, ROUND(AVG(price), 2) AS avg_price
      FROM products
      GROUP BY category
      ORDER BY avg_price DESC;`,
    hints: ['AVG() works with GROUP BY just like COUNT() does.', 'ROUND(value, 2) rounds to 2 decimal places.'],
    tests: {
      reject: [
        `SELECT category, AVG(price) AS avg_price FROM products GROUP BY category ORDER BY avg_price DESC`,
        `SELECT category, ROUND(AVG(price), 2) AS avg_price FROM products GROUP BY category ORDER BY avg_price`,
      ],
    },
  },
  {
    id: 'high-paying-departments',
    tier: 'medium',
    dataset: 'shop',
    title: 'Deep Pockets',
    prompt:
      'Show each department whose average salary is above 100,000, along with that average rounded to a whole number. Highest average first.',
    columns: ['department', 'avg_salary'],
    orderMatters: true,
    solution: `
      SELECT department, ROUND(AVG(salary)) AS avg_salary
      FROM employees
      GROUP BY department
      HAVING AVG(salary) > 100000
      ORDER BY avg_salary DESC;`,
    hints: [
      'WHERE filters rows before grouping. To filter on an aggregate like AVG(), you need something else.',
      'Use HAVING AVG(salary) > 100000 after the GROUP BY.',
    ],
    tests: {
      reject: [
        `SELECT department, ROUND(AVG(salary)) AS avg_salary FROM employees
         WHERE salary > 100000 GROUP BY department ORDER BY avg_salary DESC`,
      ],
    },
  },
  {
    id: 'units-sold',
    tier: 'medium',
    dataset: 'shop',
    title: 'Moving Units',
    prompt:
      'For every product that has been ordered at least once, show its name and the total quantity ordered across all orders. Most units first; break ties alphabetically by name.',
    columns: ['name', 'units_sold'],
    orderMatters: true,
    solution: `
      SELECT p.name, SUM(oi.quantity) AS units_sold
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY units_sold DESC, p.name;`,
    hints: [
      'Quantities live in order_items. Join it to products to get the names.',
      'You can sort by two things: ORDER BY units_sold DESC, name.',
    ],
    tests: {
      reject: [
        `SELECT p.name, COUNT(*) AS units_sold FROM products p JOIN order_items oi ON oi.product_id = p.id
         GROUP BY p.id ORDER BY units_sold DESC, p.name`,
        `SELECT p.name, SUM(oi.quantity) AS units_sold FROM products p JOIN order_items oi ON oi.product_id = p.id
         GROUP BY p.id ORDER BY units_sold DESC`,
      ],
    },
  },
  {
    id: 'employee-managers',
    tier: 'medium',
    dataset: 'shop',
    title: 'Who\'s the Boss?',
    prompt:
      'List every employee next to the name of their manager, sorted by employee name. Employees without a manager should still appear, with an empty (NULL) manager.',
    columns: ['employee', 'manager'],
    orderMatters: true,
    solution: `
      SELECT e.name AS employee, m.name AS manager
      FROM employees e
      LEFT JOIN employees m ON m.id = e.manager_id
      ORDER BY e.name;`,
    hints: [
      'You can join a table to itself. Give each copy its own alias, like employees e and employees m.',
      'An INNER JOIN drops the employee who has no manager. A LEFT JOIN keeps them.',
    ],
    tests: {
      reject: [
        `SELECT e.name, m.name FROM employees e JOIN employees m ON m.id = e.manager_id ORDER BY e.name`,
        `SELECT e.name, m.name FROM employees e LEFT JOIN employees m ON e.id = m.manager_id ORDER BY e.name`,
      ],
    },
  },

  // ---------------------------------------------------------------- HARD (300 pts)
  {
    id: 'top-customers-revenue',
    tier: 'hard',
    dataset: 'shop',
    title: 'Big Spenders',
    prompt:
      'Find the 3 customers who have spent the most on SHIPPED orders. Revenue is quantity × product price. Show the customer name and their revenue rounded to 2 decimal places, highest first.',
    columns: ['name', 'revenue'],
    orderMatters: true,
    solution: `
      SELECT c.name, ROUND(SUM(oi.quantity * p.price), 2) AS revenue
      FROM customers c
      JOIN orders o       ON o.customer_id = c.id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p     ON p.id = oi.product_id
      WHERE o.status = 'shipped'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT 3;`,
    hints: [
      'You need four tables: customers → orders → order_items → products.',
      'Filter to shipped orders, GROUP BY customer, SUM(quantity * price), then ORDER BY ... DESC LIMIT 3.',
    ],
    tests: {
      reject: [
        `SELECT c.name, ROUND(SUM(oi.quantity * p.price), 2) AS revenue FROM customers c
         JOIN orders o ON o.customer_id = c.id JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id GROUP BY c.id ORDER BY revenue DESC LIMIT 3`,
        `SELECT c.name, ROUND(SUM(p.price), 2) AS revenue FROM customers c
         JOIN orders o ON o.customer_id = c.id JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id WHERE o.status = 'shipped'
         GROUP BY c.id ORDER BY revenue DESC LIMIT 3`,
      ],
    },
  },
  {
    id: 'top-earner-per-department',
    tier: 'hard',
    dataset: 'shop',
    title: 'Top of the Ladder',
    prompt:
      'For each department, find the highest-paid employee. Show the department, the employee\'s name and their salary, sorted by department.',
    columns: ['department', 'name', 'salary'],
    orderMatters: true,
    solution: `
      SELECT department, name, salary
      FROM (
        SELECT department, name, salary,
               RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rnk
        FROM employees
      )
      WHERE rnk = 1
      ORDER BY department;`,
    hints: [
      'One way: a subquery that finds MAX(salary) per department, then join back to employees.',
      'Another way: RANK() OVER (PARTITION BY department ORDER BY salary DESC), then keep rank 1.',
    ],
    tests: {
      accept: [
        `SELECT e.department, e.name, e.salary FROM employees e
         WHERE e.salary = (SELECT MAX(salary) FROM employees WHERE department = e.department)
         ORDER BY e.department`,
      ],
      reject: [`SELECT department, name, salary FROM employees ORDER BY salary DESC LIMIT 4`],
    },
  },
  {
    id: 'running-total',
    tier: 'hard',
    dataset: 'shop',
    title: 'Keeping Score',
    prompt:
      'For each SHIPPED order, show the order id, order date, the order\'s total (quantity × price, rounded to 2 decimals) and a running total of all shipped order totals up to and including that order (also rounded to 2 decimals). Sort by order date.',
    columns: ['order_id', 'order_date', 'order_total', 'running_total'],
    orderMatters: true,
    solution: `
      SELECT o.id AS order_id,
             o.order_date,
             ROUND(SUM(oi.quantity * p.price), 2) AS order_total,
             ROUND(SUM(SUM(oi.quantity * p.price)) OVER (ORDER BY o.order_date), 2) AS running_total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p     ON p.id = oi.product_id
      WHERE o.status = 'shipped'
      GROUP BY o.id, o.order_date
      ORDER BY o.order_date;`,
    hints: [
      'Start by getting each shipped order\'s total with GROUP BY.',
      'A window function adds up rows "so far": SUM(...) OVER (ORDER BY order_date). You can wrap your order totals in a CTE (WITH ...) first.',
    ],
    tests: {
      accept: [
        `WITH totals AS (
           SELECT o.id, o.order_date, SUM(oi.quantity * p.price) AS t
           FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
           WHERE o.status = 'shipped' GROUP BY o.id
         )
         SELECT id, order_date, ROUND(t, 2), ROUND(SUM(t) OVER (ORDER BY order_date), 2)
         FROM totals ORDER BY order_date`,
      ],
    },
  },
  {
    id: 'monthly-orders',
    tier: 'hard',
    dataset: 'shop',
    title: 'Month over Month',
    prompt:
      'Count the orders placed in each month (as \'YYYY-MM\'), and show how that count changed from the previous month in the list. The first month\'s change should be NULL. Sort by month.',
    columns: ['month', 'orders', 'change'],
    orderMatters: true,
    solution: `
      SELECT month, orders, orders - LAG(orders) OVER (ORDER BY month) AS change
      FROM (
        SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders
        FROM orders
        GROUP BY month
      )
      ORDER BY month;`,
    hints: [
      'In SQLite, strftime(\'%Y-%m\', order_date) turns \'2024-03-02\' into \'2024-03\'.',
      'LAG(orders) OVER (ORDER BY month) gives you the previous row\'s count.',
    ],
    tests: {
      accept: [
        `SELECT substr(order_date, 1, 7) AS m, COUNT(*),
                COUNT(*) - LAG(COUNT(*)) OVER (ORDER BY substr(order_date, 1, 7))
         FROM orders GROUP BY m ORDER BY m`,
      ],
    },
  },
  {
    id: 'best-seller-per-category',
    tier: 'hard',
    dataset: 'shop',
    title: 'Category Champions',
    prompt:
      'For each product category, find the product with the most units ordered (total quantity across all orders). Show the category, product name and units ordered, sorted by category.',
    columns: ['category', 'name', 'units'],
    orderMatters: true,
    solution: `
      WITH units AS (
        SELECT p.category, p.name, SUM(oi.quantity) AS units
        FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        GROUP BY p.id
      )
      SELECT category, name, units
      FROM units u
      WHERE units = (SELECT MAX(units) FROM units WHERE category = u.category)
      ORDER BY category;`,
    hints: [
      'Break it into steps. First, a CTE (WITH units AS (...)) with total units per product.',
      'Then keep only the product whose units equal the MAX for its category, or use RANK() OVER (PARTITION BY category ...).',
    ],
    tests: {
      reject: [
        `SELECT p.category, p.name, MAX(oi.quantity) FROM products p
         JOIN order_items oi ON oi.product_id = p.id GROUP BY p.category ORDER BY p.category`,
      ],
    },
  },
  {
    id: 'second-order',
    tier: 'hard',
    dataset: 'shop',
    title: 'Coming Back for More',
    prompt:
      'For every customer who has placed at least two orders, show their name and the date of their SECOND order. Sort by name.',
    columns: ['name', 'second_order_date'],
    orderMatters: true,
    solution: `
      SELECT name, order_date AS second_order_date
      FROM (
        SELECT c.name, o.order_date,
               ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY o.order_date) AS n
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
      )
      WHERE n = 2
      ORDER BY name;`,
    hints: [
      'Number each customer\'s orders from oldest to newest.',
      'ROW_NUMBER() OVER (PARTITION BY customer ORDER BY order_date) does exactly that. Then keep row number 2.',
    ],
    tests: {
      reject: [
        `SELECT c.name, MAX(o.order_date) FROM customers c JOIN orders o ON o.customer_id = c.id
         GROUP BY c.id HAVING COUNT(*) >= 2 ORDER BY c.name`,
      ],
    },
  },
];
