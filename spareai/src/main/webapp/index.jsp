<%@ page contentType="text/html; charset=UTF-8" %>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SpareAI API</title>
</head>
<body>
  <h2>SpareAI backend is running</h2>
  <p>API base: <code><%= request.getContextPath() %>/api</code></p>
  <p style="margin: 1.25rem 0;">
    <a href="<%= request.getContextPath() %>/ui/dashboard.jsp"
       style="display:inline-block;padding:0.65rem 1.35rem;background:#0D1B2A;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;border-left:4px solid #2B8FD0;font-family:system-ui,sans-serif;">
      Open SpareAI Dashboard
    </a>
  </p>
  <ul>
    <li><code>/api/inventory/list</code></li>
    <li><code>/api/consumption/history</code></li>
    <li><code>/api/forecast/{code}?horizon=30</code></li>
    <li><code>/api/charts/stock-levels</code></li>
  </ul>
</body>
</html>
