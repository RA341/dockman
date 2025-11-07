# STAGING_LAG

Dockman times out while waiting for files to be staged with Git. This usually occurs when your compose directory
contains large files or folders (e.g., databases, media, or volumes) that slow down the git add process.

Dockman will only see top level directories but Git will attempt to load all files/folders at full depth regardless.

**Original issue:** [#40](https://github.com/RA341/dockman/issues/40)

* **Message:**
    ```
    CODE: [STAGING_LAG] Git timed out waiting for the staging operation, it took more than 5 seconds to add files.
    This is likely due to large files/folders in your compose root.
    To resolve this, refer to: https://github.com/RA341/dockman?tab=readme-ov-file#staging_lag
    ```

* **Cause:** By default, Dockman stages the entire stack directory for versioning. If there are large or unnecessary
  files (such as volume data, logs, or other artifacts) in your stacks folder, Git may become slow or unresponsive
  during the staging operation.

* **Solution:**
    * **Separate data from configuration:** Move large or dynamic files to a separate `data/` or `volumes/` folder
      outside the stack root.
        * **Example directory structure:**
            ```
            /home/zaphodb/docker/compose  ← use only to store your compose files and configs
            /home/zaphodb/docker/data     ← use only to store your docker container data
            ```
        * **Examples**
            * **❌ Wrong (causes STAGING_LAG):**
                ```yaml
                  postgres:
                    image: postgres:15
                    volumes:
                      - ./data/postgres:/var/lib/postgresql/data  # <- Large data inside compose root caused by './'
                      - ./logs:/var/log  # Log files inside compose root
                ```

            * **✅ Correct (avoids STAGING_LAG):**
              ```yaml
                postgres:
                  image: postgres:15
                  volumes:
                    - ../data/postgres:/var/lib/postgresql/data  # Data stored outside compose root
                    - ../logs:/var/log  # Logs stored outside compose root
                    # or with a full path
                    # - /home/zaphodb/docker/data/postgres/logs
                    # - /home/zaphodb/docker/data/postgres/data
                    - ./config/init.sql:/docker-entrypoint-initdb.d/init.sql  # keep simple Config files in compose root
              ```
    * **Keep stack root clean:** Only include Docker Compose files and relevant configuration files in your stack
      directory.
    * **Avoid .gitignore as a workaround**: While you can use .gitignore to exclude files, this is not recommended for
      Dockman. The better cleaner practice is to keep only relevant configuration files in your compose root and
      separate your
      stack definitions from your data directories entirely.
    * **See also:** [Recommended file layout](../file-layout/overview.md) for best practices.
