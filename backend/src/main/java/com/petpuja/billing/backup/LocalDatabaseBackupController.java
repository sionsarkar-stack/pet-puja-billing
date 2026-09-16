package com.petpuja.billing.backup;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import javax.sql.DataSource;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/backups")
public class LocalDatabaseBackupController {

    private static final DateTimeFormatter BACKUP_FILE_TIMESTAMP = DateTimeFormatter
            .ofPattern("yyyy-MM-dd-HHmmss")
            .withZone(ZoneOffset.UTC);

    private final DataSource dataSource;

    public LocalDatabaseBackupController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping(value = "/local-database", produces = "application/zip")
    public ResponseEntity<StreamingResponseBody> downloadLocalDatabaseBackup() {
        Path backupDirectory;
        try {
            backupDirectory = Files.createTempDirectory("pet-puja-backup-");
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not prepare database backup",
                    exception);
        }

        var backupFile = backupDirectory.resolve("database-backup.zip");
        try (var connection = dataSource.getConnection()) {
            if (!"H2".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())) {
                deleteBackupFiles(backupFile);
                throw new ResponseStatusException(
                        HttpStatus.NOT_IMPLEMENTED,
                        "Local database backup is available only with the H2 local profile");
            }

            try (var statement = connection.createStatement()) {
                statement.execute("BACKUP TO '" + backupFile.toAbsolutePath().toString().replace("'", "''") + "'");
            }
        } catch (SQLException exception) {
            deleteBackupFiles(backupFile);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not create database backup",
                    exception);
        }

        var fileName = "pet-puja-backup-" + BACKUP_FILE_TIMESTAMP.format(Instant.now()) + ".zip";
        StreamingResponseBody responseBody = outputStream -> {
            try (var backupInput = Files.newInputStream(backupFile)) {
                backupInput.transferTo(outputStream);
            } finally {
                deleteBackupFiles(backupFile);
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .body(responseBody);
    }

    private static void deleteBackupFiles(Path backupFile) {
        try {
            Files.deleteIfExists(backupFile);
            Files.deleteIfExists(backupFile.getParent());
        } catch (IOException ignored) {
        }
    }
}