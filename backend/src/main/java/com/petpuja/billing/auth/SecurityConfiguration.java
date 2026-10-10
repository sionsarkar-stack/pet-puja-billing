package com.petpuja.billing.auth;

import java.util.List;

import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import jakarta.servlet.http.HttpServletResponse;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({ AdminCredentialsProperties.class, CaptainCredentialsProperties.class })
public class SecurityConfiguration {

        @Bean
        PasswordEncoder passwordEncoder() {
                return new BCryptPasswordEncoder();
        }

        @Bean
        AuthenticationManager authenticationManager(
                        AdminCredentialsProperties adminCredentials,
                        CaptainCredentialsProperties captainCredentials,
                        PasswordEncoder passwordEncoder) {
                if (adminCredentials.username().equals(captainCredentials.username())) {
                        throw new IllegalStateException("Admin and captain usernames must be different");
                }

                var encodedAdminPassword = passwordEncoder.encode(adminCredentials.password());
                var encodedCaptainPassword = passwordEncoder.encode(captainCredentials.password());

                return authentication -> {
                        var credentials = authentication.getCredentials();
                        if (!(credentials instanceof String password)) {
                                throw new BadCredentialsException("Invalid username or password");
                        }

                        if (adminCredentials.username().equals(authentication.getName())
                                        && passwordEncoder.matches(password, encodedAdminPassword)) {
                                return UsernamePasswordAuthenticationToken.authenticated(
                                                adminCredentials.username(),
                                                null,
                                                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
                        }

                        if (captainCredentials.username().equals(authentication.getName())
                                        && passwordEncoder.matches(password, encodedCaptainPassword)) {
                                return UsernamePasswordAuthenticationToken.authenticated(
                                                captainCredentials.username(),
                                                null,
                                                List.of(new SimpleGrantedAuthority("ROLE_CAPTAIN")));
                        }

                        throw new BadCredentialsException("Invalid username or password");
                };
        }

        @Bean
        SecurityContextRepository securityContextRepository() {
                return new HttpSessionSecurityContextRepository();
        }

        @Bean
        SecurityFilterChain securityFilterChain(
                        HttpSecurity http,
                        SecurityContextRepository securityContextRepository) throws Exception {
                return http
                                .csrf(csrf -> csrf.ignoringRequestMatchers("/api/**"))
                                .httpBasic(httpBasic -> httpBasic.disable())
                                .formLogin(formLogin -> formLogin.disable())
                                .logout(logout -> logout.disable())
                                .requestCache(requestCache -> requestCache.disable())
                                .securityContext(securityContext -> securityContext
                                                .securityContextRepository(securityContextRepository)
                                                .requireExplicitSave(true))
                                .authorizeHttpRequests(requests -> requests
                                                .requestMatchers("/api/auth/login", "/api/auth/logout",
                                                                "/api/auth/session", "/api/health",
                                                                "/api/public-config", "/actuator/health", "/error")
                                                .permitAll()
                                                .requestMatchers("/api/expenses/**", "/api/daily-closings/**",
                                                                "/api/balance-sheet/**", "/api/backups/**")
                                                .hasRole("ADMIN")
                                                .requestMatchers(HttpMethod.POST, "/api/menu", "/api/menu/**")
                                                .hasRole("ADMIN")
                                                .requestMatchers(HttpMethod.PUT, "/api/menu/**").hasRole("ADMIN")
                                                .requestMatchers(HttpMethod.DELETE, "/api/menu/**").hasRole("ADMIN")
                                                .anyRequest().hasAnyRole("ADMIN", "CAPTAIN"))
                                .exceptionHandling(exceptions -> exceptions
                                                .authenticationEntryPoint((request, response, exception) -> response
                                                                .sendError(HttpServletResponse.SC_UNAUTHORIZED)))
                                .build();
        }
}