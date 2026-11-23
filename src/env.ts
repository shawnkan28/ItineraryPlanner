import { defineEnvVars } from '@sveltejs/kit/env';

/** Optional string: unset or empty becomes undefined. */
const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	APP_PASSWORD: { schema: optional, description: 'Single-user password. No login when unset.' },
	SESSION_SECRET: { schema: optional, description: 'Signs the session cookie.' },
	DATABASE_PATH: { schema: optional, description: 'SQLite file, default data/itinerary_planner.db.' },
	MIGRATIONS_PATH: { schema: optional, description: 'Drizzle migrations folder, default drizzle.' },
	VAULT_PATH: { schema: optional, description: 'Obsidian vault root (folder containing Travel/).' }
});
