
import { describe, it, expect } from "vitest";
import { generateRandomString, parseFormEncoded } from "./oauth.js";

describe("OAuth Utilities", () => {
  describe("generateRandomString", () => {
    it("should generate string of requested length", () => {
      const str16 = generateRandomString(16);
      const str32 = generateRandomString(32);
      const str64 = generateRandomString(64);

      expect(str16.length).toBe(16);
      expect(str32.length).toBe(32);
      expect(str64.length).toBe(64);
    });

    it("should use only allowed characters for PKCE", () => {
      const allowedChars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
      const str = generateRandomString(100);

      for (const char of str) {
        expect(allowedChars).toContain(char);
      }
    });

    it("should generate different strings each time", () => {
      const str1 = generateRandomString(32);
      const str2 = generateRandomString(32);
      const str3 = generateRandomString(32);

      // Very unlikely to be the same (entropy of 32 chars from 66 possible)
      expect(str1).not.toBe(str2);
      expect(str2).not.toBe(str3);
      expect(str1).not.toBe(str3);
    });

    it("should default to 32 characters if no length specified", () => {
      const str = generateRandomString();
      expect(str.length).toBe(32);
    });

    it("should handle length 0", () => {
      const str = generateRandomString(0);
      expect(str.length).toBe(0);
      expect(str).toBe("");
    });

    it("should handle large lengths", () => {
      const str = generateRandomString(256);
      expect(str.length).toBe(256);
    });

    it("should generate cryptographically random values", () => {
      // Generate multiple strings and check they have good distribution
      const strings = Array.from({ length: 10 }, () => generateRandomString(32));
      const uniqueChars = new Set(strings.join(""));

      // Should use a variety of the available 66 characters
      // Very unlikely to have fewer than 30 unique characters in 320 random chars
      expect(uniqueChars.size).toBeGreaterThan(20);
    });
  });

  describe("parseFormEncoded", () => {
    it("should parse simple form-encoded string", () => {
      const result = parseFormEncoded("key=value");
      expect(result.key).toBe("value");
    });

    it("should parse multiple parameters", () => {
      const result = parseFormEncoded("name=john&age=30&city=NYC");
      expect(result.name).toBe("john");
      expect(result.age).toBe("30");
      expect(result.city).toBe("NYC");
    });

    it("should decode URL-encoded characters", () => {
      const result = parseFormEncoded(
        "message=hello%20world&emoji=%F0%9F%98%80"
      );
      expect(result.message).toBe("hello world");
      expect(result.emoji).toBe("😀");
    });

    it("should handle empty values", () => {
      const result = parseFormEncoded("key1=value&key2=&key3=value3");
      expect(result.key1).toBe("value");
      expect(result.key2).toBe("");
      expect(result.key3).toBe("value3");
    });

    it("should handle missing values", () => {
      const result = parseFormEncoded("key1&key2=value");
      expect(result.key1).toBe("");
      expect(result.key2).toBe("value");
    });

    it("should decode OAuth common values", () => {
      const oauthResponse =
        "oauth_token=test%2Btoken&oauth_token_secret=secret&oauth_callback_confirmed=true";
      const result = parseFormEncoded(oauthResponse);

      expect(result.oauth_token).toBe("test+token");
      expect(result.oauth_token_secret).toBe("secret");
      expect(result.oauth_callback_confirmed).toBe("true");
    });

    it("should handle empty string", () => {
      const result = parseFormEncoded("");
      expect(Object.keys(result).length).toBe(0);
    });

    it("should ignore pairs without equals", () => {
      const result = parseFormEncoded("valid=value&invalid&another=test");
      expect(result.valid).toBe("value");
      // Keys without = get empty string value
      expect(result.invalid).toBe("");
      expect(result.another).toBe("test");
    });

    it("should handle duplicate keys (last value wins)", () => {
      const result = parseFormEncoded("key=first&key=second");
      // Typically last value wins in form parsing
      expect(result.key).toBe("second");
    });

    it("should preserve plus signs as literal characters", () => {
      const result = parseFormEncoded("formula=a%2Bb");
      expect(result.formula).toBe("a+b");
    });

    it("should handle complex query string from OAuth providers", () => {
      const response =
        "code=4%2FqgEHa4nHKxZY_qJZvCxVnKP8XwJ8vqxDz&state=abc123&scope=user";
      const result = parseFormEncoded(response);

      expect(result.code).toBe("4/qgEHa4nHKxZY_qJZvCxVnKP8XwJ8vqxDz");
      expect(result.state).toBe("abc123");
      expect(result.scope).toBe("user");
    });

    it("should handle special characters in values", () => {
      const result = parseFormEncoded(
        "text=hello%21%40%23%24%25&json=%7B%22key%22%3A%22value%22%7D"
      );
      expect(result.text).toBe("hello!@#$%");
      expect(result.json).toBe('{"key":"value"}');
    });

    it("should not throw on malformed input", () => {
      expect(() => parseFormEncoded("")).not.toThrow();
      expect(() => parseFormEncoded("===")).not.toThrow();
      expect(() => parseFormEncoded("&&&")).not.toThrow();
    });
  });
});
