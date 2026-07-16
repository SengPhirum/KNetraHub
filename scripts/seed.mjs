import pg from 'pg';
import { nanoid } from 'nanoid';

const { Pool } = pg;

const db = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'knetrahub',
  user: 'knetrahub',
  password: 'knetrahub',
});

// Monitoring is intentionally NOT seeded here: the LibreNMS-equivalent
// Monitoring module only ever contains real, discovered devices and real
// collected data. Demo/simulated monitoring data is permitted only inside
// automated tests (layers/monitoring/tests/) and explicitly named demo
// environments — never in a normal runtime seed.

async function run() {
  try {
    const ipamRes = await db.query('SELECT count(*) as cnt FROM ipmgt_subnets');
    if (Number(ipamRes.rows[0].cnt) === 0) {
      console.log('Seeding IPAM subnets...');
      const s1 = nanoid();
      const s2 = nanoid();

      await db.query(`INSERT INTO ipmgt_subnets (id, name, network, vlan, gateway, usage) VALUES
        ($1, 'Server Vlan', '10.0.1.0/24', 10, '10.0.1.254', 70),
        ($2, 'DB Vlan', '10.0.2.0/24', 20, '10.0.2.254', 17)`,
        [s1, s2]
      );

      await db.query(`INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, mac, description, state) VALUES
        ($1, $2, '10.0.1.1', 'N/A', '-', 'Reserved', 'Reserved'),
        ($3, $2, '10.0.1.10', 'web-front-01', '00:1A:2B:3C:4D:5E', 'Production Web Server', 'Used'),
        ($4, $2, '10.0.1.11', 'web-front-02', '00:1A:2B:3C:4D:5F', 'Production Web Server', 'Used')`,
        [nanoid(), s1, nanoid(), nanoid()]
      );
    }
    console.log('Done!');
  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
  }
}
run();
