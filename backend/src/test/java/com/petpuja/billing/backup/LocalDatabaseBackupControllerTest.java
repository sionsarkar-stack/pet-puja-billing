package com.petpuja.billing.backup;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicReference;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

class LocalDatabaseBackupControllerTest {

    @Test
    void streamsAnH2BackupArchiveAndRemovesTheTemporaryCopy() throws Exception {
        var dataSource = mock(DataSource.class);
        var connection = mock(Connection.class);
        var databaseMetaData = mock(DatabaseMetaData.class);
        var statement = mock(Statement.class);
        var backupFile = new AtomicReference<Path>();
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(databaseMetaData);
        when(databaseMetaData.getDatabaseProductName()).thenReturn("H2");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.execute(anyString())).thenAnswer(invocation -> {
            var backupCommand = invocation.getArgument(0, String.class);
            var fileName = backupCommand.substring("BACKUP TO '".length(), backupCommand.length() - 1);
            var path = Path.of(fileName);
            Files.writeString(path, "backup archive", StandardCharsets.UTF_8);
            backupFile.set(path);
            return true;
        });
        var controller = new LocalDatabaseBackupController(dataSource);

        var response = controller.downloadLocalDatabaseBackup();

        var contentType = response.getHeaders().getContentType();
        assertNotNull(contentType);
        assertEquals("application/zip", contentType.toString());
        var contentDisposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.startsWith("attachment; filename=\"pet-puja-backup-"));
        var output = new ByteArrayOutputStream();
        var responseBody = response.getBody();
        assertNotNull(responseBody);
        responseBody.writeTo(output);
        assertEquals("backup archive", output.toString(StandardCharsets.UTF_8));
        var temporaryBackupFile = backupFile.get();
        assertNotNull(temporaryBackupFile);
        assertFalse(Files.exists(temporaryBackupFile));
        assertFalse(Files.exists(temporaryBackupFile.getParent()));
        verify(statement).execute(startsWith("BACKUP TO '"));
    }
}