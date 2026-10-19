CREATE TABLE committee_member (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(20) NOT NULL UNIQUE,
    normalized_name VARCHAR(20) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO committee_member (name, normalized_name) VALUES
    ('Rimo', 'rimo'), ('Rjoe', 'rjoe'), ('Rishi', 'rishi'), ('Dinda', 'dinda');