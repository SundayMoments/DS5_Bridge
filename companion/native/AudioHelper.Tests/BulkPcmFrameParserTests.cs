using System.Buffers.Binary;
using Xunit;

public sealed class BulkPcmFrameParserTests
{
    [Fact]
    public void PushBuffersPartialPacketsUntilComplete()
    {
        var parser = new BulkPcmFrameParser();
        var packet = BuildPacket(sequence: 0x1234, frames: 3, timestampUs: 0xdeadbeef);

        Assert.Empty(parser.Push(packet, 7));

        var remaining = packet.Skip(7).ToArray();
        var frames = parser.Push(remaining, remaining.Length);

        var frame = Assert.Single(frames);
        Assert.Equal(0x1234, frame.Sequence);
        Assert.Equal(3, frame.Frames);
        Assert.Equal(0xdeadbeef, frame.TimestampUs);
        Assert.Equal(packet.Skip(WinUsbPcmTransport.HeaderBytes).ToArray(), frame.Payload);
        Assert.False(frame.Silent);
    }

    [Fact]
    public void PushSkipsGarbageAndInvalidHeadersBeforeAValidPacket()
    {
        var parser = new BulkPcmFrameParser();
        var invalid = BuildPacket(sequence: 1, frames: 0, timestampUs: 10);
        var valid = BuildPacket(sequence: 2, frames: 2, timestampUs: 20);
        var stream = new byte[] { 0xaa, 0xbb, 0xcc }
            .Concat(invalid)
            .Concat(new byte[] { 0x00, 0xff })
            .Concat(valid)
            .ToArray();

        var frames = parser.Push(stream, stream.Length);

        var frame = Assert.Single(frames);
        Assert.Equal(2, frame.Sequence);
        Assert.Equal(2, frame.Frames);
        Assert.Equal(20u, frame.TimestampUs);
        Assert.Equal(valid.Skip(WinUsbPcmTransport.HeaderBytes).ToArray(), frame.Payload);
    }

    [Fact]
    public void PushKeepsTrailingMagicPrefixForTheNextCall()
    {
        var parser = new BulkPcmFrameParser();
        var packet = BuildPacket(sequence: 9, frames: 1, timestampUs: 30);
        var firstChunk = new byte[] { 0x12, (byte)'D', (byte)'5', (byte)'P' };

        Assert.Empty(parser.Push(firstChunk, firstChunk.Length));

        var secondChunk = new[] { (byte)'C' }
            .Concat(packet.Skip(4))
            .ToArray();
        var frames = parser.Push(secondChunk, secondChunk.Length);

        var frame = Assert.Single(frames);
        Assert.Equal(9, frame.Sequence);
        Assert.Equal(packet.Skip(WinUsbPcmTransport.HeaderBytes).ToArray(), frame.Payload);
    }

    private static byte[] BuildPacket(ushort sequence, ushort frames, uint timestampUs)
    {
        var payloadBytes = frames * WinUsbPcmTransport.FrameBytes;
        var packet = new byte[WinUsbPcmTransport.HeaderBytes + payloadBytes];
        packet[0] = (byte)'D';
        packet[1] = (byte)'5';
        packet[2] = (byte)'P';
        packet[3] = (byte)'C';
        packet[4] = 1;
        packet[5] = WinUsbPcmTransport.Channels;
        packet[6] = WinUsbPcmTransport.BytesPerSample;
        BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(8, 2), sequence);
        BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(10, 2), frames);
        BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(12, 4), timestampUs);
        for (var index = 0; index < payloadBytes; index++)
        {
            packet[WinUsbPcmTransport.HeaderBytes + index] = (byte)((sequence + index * 3) & 0xff);
        }
        return packet;
    }
}
