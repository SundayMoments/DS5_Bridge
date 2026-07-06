using System.Text.Json;

static class CompanionTransportServer
{
    private const int ReportBytes = 64;

    public static async Task<int> RunAsync()
    {
        WinUsbBridgeTransport transport;
        try
        {
            transport = WinUsbBridgeTransport.Open();
        }
        catch (Exception error)
        {
            await WriteResponse(new
            {
                id = 0,
                ok = false,
                error = $"{error.GetType().Name}: {error.Message}"
            });
            return 2;
        }

        using (transport)
        {
            await WriteResponse(new
            {
                id = 0,
                ok = true,
                path = transport.DevicePath
            });

            string? line;
            while ((line = await Console.In.ReadLineAsync()) is not null)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                await HandleLine(transport, line);
            }
        }

        return 0;
    }

    private static async Task HandleLine(WinUsbBridgeTransport transport, string line)
    {
        var id = 0;
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            id = root.GetProperty("id").GetInt32();
            var op = root.GetProperty("op").GetString();
            switch (op)
            {
                case "get":
                    {
                        var reportId = root.GetProperty("reportId").GetByte();
                        var report = transport.GetReport(reportId);
                        await WriteResponse(new
                        {
                            id,
                            ok = true,
                            report = report.Select(value => (int)value).ToArray()
                        });
                        return;
                    }
                case "write":
                    {
                        var report = ReadReport(root.GetProperty("report"));
                        transport.WriteReport(report);
                        await WriteResponse(new
                        {
                            id,
                            ok = true
                        });
                        return;
                    }
                case "set":
                    {
                        var report = ReadReport(root.GetProperty("report"));
                        transport.SetReport(report);
                        await WriteResponse(new
                        {
                            id,
                            ok = true
                        });
                        return;
                    }
                case "close":
                    await WriteResponse(new
                    {
                        id,
                        ok = true
                    });
                    Environment.ExitCode = 0;
                    Environment.Exit(0);
                    return;
                default:
                    throw new InvalidOperationException($"Unknown operation '{op}'.");
            }
        }
        catch (Exception error)
        {
            await WriteResponse(new
            {
                id,
                ok = false,
                error = $"{error.GetType().Name}: {error.Message}"
            });
        }
    }

    private static byte[] ReadReport(JsonElement element)
    {
        var report = new byte[ReportBytes];
        var index = 0;
        foreach (var item in element.EnumerateArray())
        {
            if (index >= ReportBytes)
            {
                break;
            }
            report[index++] = item.GetByte();
        }
        if (index != ReportBytes)
        {
            throw new InvalidOperationException($"Expected {ReportBytes} report bytes, received {index}.");
        }
        return report;
    }

    private static async Task WriteResponse(object response)
    {
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(response));
        await Console.Out.FlushAsync();
    }
}
