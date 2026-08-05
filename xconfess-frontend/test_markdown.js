const markdown = "<script>alert(1)</script> [click](javascript:alert(1)) <iframe src='blah'></iframe> <div onclick='alert(2)'></div>";
let sanitized = markdown;
sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
sanitized = sanitized.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
sanitized = sanitized.replace(/\bon[a-z]+\s*=\s*(?:(['"]?)[\s\S]*?\1|[^\s>]+)/gi, "");
sanitized = sanitized.replace(/(javascript|vbscript|data):/gi, "$1_blocked:");
console.log(sanitized);
