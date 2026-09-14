package com.petpuja.billing.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HealthControllerTest {

	private final HealthController controller = new HealthController();

	@Test
	void reportsApplicationAsHealthy() {
		var response = controller.health();

		assertThat(response.application()).isEqualTo("pet-puja-billing");
		assertThat(response.status()).isEqualTo("UP");
		assertThat(response.timestamp()).isNotNull();
	}
}

