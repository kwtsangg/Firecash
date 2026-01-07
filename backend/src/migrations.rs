use sqlx::migrate::{MigrateError, Migrator};
use sqlx::PgPool;

pub async fn run_with_repair(pool: &PgPool) -> Result<(), MigrateError> {
    let mut migrator = sqlx::migrate!("./migrations");
    let mut attempts = 0usize;

    loop {
        match migrator.run(pool).await {
            Ok(()) => return Ok(()),
            Err(MigrateError::VersionMismatch(version)) => {
                attempts += 1;
                if attempts > migrator.iter().count() {
                    return Err(MigrateError::VersionMismatch(version));
                }

                let Some(migration) = migrator.iter().find(|migration| migration.version == version)
                else {
                    return Err(MigrateError::VersionMissing(version));
                };

                sqlx::query("UPDATE _sqlx_migrations SET checksum = $1 WHERE version = $2")
                    .bind(migration.checksum.as_ref())
                    .bind(version)
                    .execute(pool)
                    .await
                    .map_err(MigrateError::Execute)?;
            }
            Err(MigrateError::VersionMissing(_)) => {
                migrator.set_ignore_missing(true);
                return migrator.run(pool).await;
            }
            Err(error) => return Err(error),
        }
    }
}
