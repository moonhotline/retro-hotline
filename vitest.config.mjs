export default {
  "test": {
    "projects": [
      "./frontend",
      {
        "root": "./backend",
        "test": {
          "name": "backend",
          "pool": "threads",
          "execArgv": [
            "--permission",
            "--allow-fs-read=frontend",
            "--allow-fs-read=backend",
            "--allow-fs-read=node_modules",
            "--allow-fs-read=vitest.config.mjs",
            "--allow-fs-read=package.json",
            "--allow-fs-read=pnpm-workspace.yaml",
            "--allow-fs-read=public"
          ],
          "maxWorkers": 1,
          "includeTaskLocation": true,
          "environment": "node",
          "include": [
            "**/*.{test,spec}.{js,mjs,cjs,ts}"
          ]
        }
      }
    ]
  }
}
