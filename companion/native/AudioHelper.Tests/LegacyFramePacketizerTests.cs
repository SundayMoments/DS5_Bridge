using System.Buffers.Binary;
using Xunit;

public sealed class LegacyFramePacketizerTests
{
    [Fact]
    public void WriteStdoutFramePrefixesFrameWithLittleEndianLength()
    {
        using var stdout = new MemoryStream();
        var prefix = new byte[2];
        var frame = Enumerable.Range(0, AudioConstants.CompactFrameBytes)
            .Select(index => (byte)(index & 0xff))
            .ToArray();

        LegacyFramePacketizer.WriteStdoutFrame(stdout, prefix, frame);

        var written = stdout.ToArray();
        Assert.Equal(AudioConstants.CompactFrameBytes + 2, written.Length);
        Assert.Equal(AudioConstants.CompactFrameBytes, BinaryPrimitives.ReadUInt16LittleEndian(written.AsSpan(0, 2)));
        Assert.Equal(frame, written.Skip(2).ToArray());
        Assert.Equal(0x08, prefix[0]);
        Assert.Equal(0x01, prefix[1]);
    }

    [Fact]
    public void WriteFastHidFragmentsPreservesSequenceHeadersAndPayloadOrder()
    {
        var frame = Enumerable.Range(0, AudioConstants.CompactFrameBytes)
            .Select(index => (byte)((index * 13 + 7) & 0xff))
            .ToArray();
        var hidReport = Enumerable.Repeat((byte)0xaa, AudioConstants.HidReportBytes).ToArray();
        var reports = new List<byte[]>();

        var ok = LegacyFramePacketizer.WriteFastHidFragments(
            frame,
            0xbeef,
            hidReport,
            report =>
            {
                reports.Add(report.ToArray());
                return true;
            },
            out var fragmentCount);

        Assert.True(ok);
        Assert.Equal((AudioConstants.CompactFrameBytes + AudioConstants.FastPayloadBytes - 1) / AudioConstants.FastPayloadBytes, fragmentCount);
        Assert.Equal(fragmentCount, reports.Count);

        var reconstructed = new List<byte>();
        for (var fragmentIndex = 0; fragmentIndex < reports.Count; fragmentIndex++)
        {
            var report = reports[fragmentIndex];
            var payloadLength = Math.Min(
                AudioConstants.FastPayloadBytes,
                AudioConstants.CompactFrameBytes - fragmentIndex * AudioConstants.FastPayloadBytes);
            Assert.Equal(AudioConstants.LegacyAudioStreamReportId, report[0]);
            Assert.Equal(AudioConstants.FastFrameFragmentType, report[1]);
            Assert.Equal(0xef, report[2]);
            Assert.Equal(0xbe, report[3]);
            Assert.Equal(fragmentIndex, report[4]);
            Assert.Equal(fragmentCount, report[5]);
            Assert.Equal(payloadLength, report[6]);
            reconstructed.AddRange(report.Skip(7).Take(payloadLength));

            if (payloadLength < AudioConstants.FastPayloadBytes)
            {
                Assert.All(report.Skip(7 + payloadLength), value => Assert.Equal(0, value));
            }
        }

        Assert.Equal(frame, reconstructed.ToArray());
    }

    [Fact]
    public void WriteFastHidFragmentsStopsWhenAFragmentWriteFails()
    {
        var frame = Enumerable.Range(0, AudioConstants.CompactFrameBytes)
            .Select(index => (byte)index)
            .ToArray();
        var hidReport = new byte[AudioConstants.HidReportBytes];
        var writeAttempts = 0;

        var ok = LegacyFramePacketizer.WriteFastHidFragments(
            frame,
            1,
            hidReport,
            _ =>
            {
                writeAttempts++;
                return writeAttempts < 2;
            },
            out var fragmentCount);

        Assert.False(ok);
        Assert.Equal((AudioConstants.CompactFrameBytes + AudioConstants.FastPayloadBytes - 1) / AudioConstants.FastPayloadBytes, fragmentCount);
        Assert.Equal(2, writeAttempts);
    }
}
