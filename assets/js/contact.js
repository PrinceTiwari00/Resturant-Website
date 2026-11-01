/* Contact / catering enquiry form.
   Posts to /api/contact when the site is served by our Node server; if the
   endpoint is not available (static hosting), it hands the message to
   WhatsApp so the enquiry is never lost. */

const form = document.querySelector("#contact-form");
const status = document.querySelector("#contact-status");
const WHATSAPP = "9779851172950";

if (form) {
  const show = (kind, html) => {
    status.className = `form-status is-visible${kind === "error" ? " form-status--error" : ""}`;
    status.innerHTML = html;
    status.setAttribute("role", "status");
  };

  const values = () => ({
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    topic: form.elements.topic.value,
    message: form.elements.message.value.trim(),
    page: location.pathname,
  });

  const validate = (data) => {
    const errors = [];
    if (data.name.length < 2) errors.push(["name", "Please tell us your name."]);
    if (data.message.length < 10) errors.push(["message", "A little more detail helps us reply properly."]);
    if (!data.phone && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(data.email))
      errors.push(["email", "Add an email or a phone number so we can get back to you."]);
    if (data.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(data.email))
      errors.push(["email", "That email address looks incomplete."]);
    return errors;
  };

  const whatsappUrl = (data) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
      [
        `Hello Kungfu Noodles — ${data.topic}`,
        "",
        data.message,
        "",
        `Name: ${data.name}`,
        data.phone ? `Phone: ${data.phone}` : "",
        data.email ? `Email: ${data.email}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )}`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    const data = values();
    const errors = validate(data);
    if (errors.length) {
      errors.forEach(([field, message]) => {
        const input = form.elements[field];
        input?.setAttribute("aria-invalid", "true");
        const hint = document.querySelector(`[data-error-for="${field}"]`);
        if (hint) hint.textContent = message;
      });
      show("error", `<p>${errors[0][1]}</p>`);
      form.elements[errors[0][0]]?.focus();
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = "Sending…";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      show(
        "ok",
        `<p><strong>Message received.</strong> We read every enquiry between services and usually reply the same day. For anything urgent, call <a href="tel:+9779851172950">+977 985-1172950</a>.</p>`
      );
    } catch {
      /* Static hosting or offline: fall back to WhatsApp. */
      const url = whatsappUrl(data);
      show(
        "ok",
        `<p><strong>Almost there.</strong> Our inbox is offline right now, so we've prepared your message in WhatsApp — <a href="${url}" target="_blank" rel="noopener">send it here</a>, or call <a href="tel:+9779851172950">+977 985-1172950</a>.</p>`
      );
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });

  form.addEventListener("input", (e) => {
    if (e.target.matches("input, textarea, select")) e.target.removeAttribute("aria-invalid");
  });
}
