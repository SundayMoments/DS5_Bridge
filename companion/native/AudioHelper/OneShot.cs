using System.Buffers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

// Bounded worker reads and output for the read-only one-shot commands whose
// result must arrive inside the companion's spawn timeout. Ported from Kitsune
// Input's Windows host (one_shot.rs).
static class OneShot
{
    // Runs work on its own background thread. Null when the thread cannot be
    // created; the caller reports that read as unknown. Background threads
    // cannot keep the process alive, so a read still blocked inside Windows
    // when the command prints is abandoned with the process.
    public static Task<T>? Start<T>(string name, Func<T> work)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            new Thread(() =>
            {
                try
                {
                    completion.TrySetResult(work());
                }
                catch (Exception error)
                {
                    completion.TrySetException(error);
                }
            })
            {
                IsBackground = true,
                Name = name
            }.Start();
        }
        catch
        {
            return null;
        }
        return completion.Task;
    }

    // A monotonic deadline in Environment.TickCount64 milliseconds.
    public static long Deadline(TimeSpan cap) => Environment.TickCount64 + (long)cap.TotalMilliseconds;

    public static TimeSpan Remaining(long deadline) =>
        TimeSpan.FromMilliseconds(Math.Max(0, deadline - Environment.TickCount64));

    // The worker's result if it arrives before the deadline. A missing, failed
    // and late worker all return false.
    public static bool TryTake<T>(Task<T>? task, long deadline, out T value)
    {
        value = default!;
        if (task is null)
        {
            return false;
        }
        try
        {
            if (!task.Wait(Remaining(deadline)))
            {
                return false;
            }
        }
        catch
        {
            return false;
        }
        value = task.Result;
        return true;
    }

    // Compact JSON with serde's escaping: quotes, backslashes and control
    // characters only, so adapter and driver names stay readable.
    public static string Json(Action<Utf8JsonWriter> write)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        }))
        {
            write(writer);
        }
        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }

    public static void WriteNullable(Utf8JsonWriter writer, string name, string? value)
    {
        if (value is null)
        {
            writer.WriteNull(name);
        }
        else
        {
            writer.WriteString(name, value);
        }
    }

    public static void WriteNullable(Utf8JsonWriter writer, string name, bool? value)
    {
        if (value is { } flag)
        {
            writer.WriteBoolean(name, flag);
        }
        else
        {
            writer.WriteNull(name);
        }
    }

    // Writes one UTF-8 line straight to stdout (not through the console code
    // page) and flushes it. Returns the exit code: 1 when the write fails.
    public static int PrintLine(string line)
    {
        try
        {
            using var stdout = Console.OpenStandardOutput();
            stdout.Write(Encoding.UTF8.GetBytes(line + "\n"));
            stdout.Flush();
            return 0;
        }
        catch
        {
            return 1;
        }
    }

    // Rust's eq_ignore_ascii_case: only A-Z fold.
    public static bool EqualsIgnoreAsciiCase(string left, string right)
    {
        if (left.Length != right.Length)
        {
            return false;
        }
        for (var index = 0; index < left.Length; index++)
        {
            if (ToAsciiLower(left[index]) != ToAsciiLower(right[index]))
            {
                return false;
            }
        }
        return true;
    }

    // Rust's to_ascii_uppercase: other characters are unchanged.
    public static string ToAsciiUpper(string text) =>
        string.Create(text.Length, text, static (destination, source) =>
        {
            for (var index = 0; index < source.Length; index++)
            {
                var character = source[index];
                destination[index] = character is >= 'a' and <= 'z' ? (char)(character - 32) : character;
            }
        });

    private static char ToAsciiLower(char character) =>
        character is >= 'A' and <= 'Z' ? (char)(character + 32) : character;
}
