# The Power of 10 Rules in Rust

This document maps "The Power of 10 Rules" (originally written for C) to Rust. Rust's design makes it much easier to follow many of these rules by default, reducing the need for manual audits. Allways follow these rules. For Javascript follow these rules: [power-of-10-rules-javascript](power-of-10-rules-javascript.md)

## The Power of 10 Rules in a Rust Context

The following table breaks down each rule and shows how Rust addresses it.

| Rule | Application to Rust | Example / Tooling |
| :--- | :--- | :--- |
| **1. Restrict to simple control flow** | Rust avoids `goto` entirely. Control flow is managed with `if`, `loop`, `while`, `for`, and `match`. `break` and `continue` can be used with labels for more complex nested loops, which some might consider analogous to `goto`, but they are far more structured and safer. | `'outer: for i in 0..10 { for j in 0..10 { if i + j > 15 { break 'outer; } } }` |
| **2. Limit all loops to a fixed upper bound** | Rust's iterators are a primary way to handle loops. You can easily enforce bounds using methods like `.take(n)` on any iterator, which limits it to the first `n` elements. For `loop` or `while`, you must rely on careful coding and external static analysis tools to verify termination. | `for item in collection.iter().take(100) { ... }` |
| **3. Do not use dynamic memory allocation after initialization** | Safe Rust **does not allow dynamic memory allocation without `unsafe` code**. The core allocation functions are within `unsafe` blocks. Safe abstractions like `Box`, `Vec`, and `String` use these internally, so to strictly follow this rule, you would avoid the standard library's collection types in the "after initialization" phase and perhaps use a custom allocator or static data structures. | Using `alloc` crate or `heapless` crate for fixed-size data structures instead of `std::collections`. |
| **4. No recursion** | Rust supports recursion, but the compiler can detect it. Following this rule is a matter of discipline and using code analysis tools to ensure no recursive function calls are present. | Tools like the one mentioned in the `rocket-safe` project can detect recursion in the source. |
| **5. Declare all data objects at the smallest possible level of scope** | This is a well-established best practice that Rust's design strongly encourages. Variables are immutable by default and should be introduced as locally as possible. Clippy, the Rust linter, has lints (like `toplevel_ref_arg`) that can warn against unnecessarily broad scope. | `let x = 42;` declared inside a function or block rather than at module level. |
| **6. Check the return value of all non-void functions** | Rust excels here. Functions that return a value you *must* use can be annotated with `#[must_use]`. The compiler will then emit a warning if the return value is ignored. This is a direct and more powerful implementation of this rule compared to C. | `#[must_use] fn calculate() -> i32 { 42 }`<br> `calculate();` // Warning: unused return value |
| **7. Limit pointer use to a single dereference** | In safe Rust, pointers are not directly accessible. You work with **references**, which are guaranteed to be valid. Dereferencing a raw pointer (like `*const T` or `*mut T`) is only possible within `unsafe` blocks. To follow the "spirit" of the rule, you would avoid `unsafe` blocks that perform multiple pointer dereferences. | Safe Rust: `let x = &y;` // `x` is a reference<br> `unsafe` Rust: `let p: *const i32 = &y; let val = *p;` // Single deref inside `unsafe` |
| **8. Declare functions at a reasonable size (e.g., < 60 lines)** | This is a stylistic and maintainability rule. It's not enforced by the compiler, but tools like Clippy can be configured to check for function length (e.g., with the `too_many_lines` lint). | `cargo clippy -- -W clippy::too_many_lines` |
| **9. Use minimally two assertions per function on average** | This is about defensive programming and testing. Rust's rich type system (like `Option<T>` and `Result<T, E>`) often eliminates the need for some runtime assertions by making invalid states unrepresentable. However, for internal logic, you can use `assert!()`, `debug_assert!()`, and the `#[cfg(test)]` module for unit tests to fulfill this rule. | `assert!(x > 0, "Value must be positive");` |
| **10. Declare all data objects at the smallest possible level of scope** | *Note: This is a duplicate of rule 5 in the original list.* | See rule 5. |

## Tools and the Rust Community

The search results also highlight the active discussion around this topic. One commenter on a forum post explicitly asked, "I'd love to see a similar paper for something like Rust," indicating a strong interest in formalizing these rules for the language.

Furthermore, there is existing work in this area. A project called **"rocket-safe"** is a static analyzer that checks C code against a select set of the Power of 10 rules. While it doesn't analyze Rust directly, its existence shows the community's ongoing focus on applying these high-integrity standards to safety-critical code, which Rust is well-suited for.

In summary, Rust doesn't just allow you to apply these rules; its core design and tooling ecosystem provide first-class support for most of them, making it a strong candidate for developing software where "The Power of 10" is the guiding principle.