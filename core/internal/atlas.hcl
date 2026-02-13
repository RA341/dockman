data "external_schema" "gorm" {
  program = [
    "go",
    "run",
    "-mod=mod",
    "./database/migrator",
  ]
}

env "sqlite" {
  src = data.external_schema.gorm.url
  dev = "sqlite://file?mode=memory&_fk=1"
  migration {
    dir = "file://database/migrations/sqlite?format=goose"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}