using System.Runtime.InteropServices;
using Xunit;

public sealed class KeyboardInputServerTests
{
    [Fact]
    public void SplitsModifiersFromKeysAndSendsGenericModifiersAsLeftKeys()
    {
        var tap = KeyboardInputServer.KeyboardTap.FromVirtualKeys(7, [0x11, 0x10, 0x1b]);
        Assert.Equal(7, tap.Id);
        Assert.Equal(new[] { 0xa2, 0xa0 }, tap.Modifiers);
        Assert.Equal(new[] { 0x1b }, tap.Keys);
    }

    [Fact]
    public void AcceptsModifierOnlyShortcutsAndDropsRepeatedKeys()
    {
        var tap = KeyboardInputServer.KeyboardTap.FromVirtualKeys(1, [0x11, 0x10, 0x11, 0x5b]);
        Assert.Equal(new[] { 0xa2, 0xa0, 0x5b }, tap.Modifiers);
        Assert.Empty(tap.Keys);
    }

    [Theory]
    [InlineData(new int[0])]
    [InlineData(new[] { 0x11, 0x10, 0x12, 0x5b, 0x41 })]
    [InlineData(new[] { 0 })]
    [InlineData(new[] { 0x100 })]
    public void RejectsEmptyOversizedAndInvalidShortcuts(int[] keys)
    {
        Assert.Throws<ArgumentException>(() => KeyboardInputServer.KeyboardTap.FromVirtualKeys(1, keys));
    }

    [Theory]
    [InlineData(0x25, true)] // Left arrow
    [InlineData(0x2e, true)] // Delete
    [InlineData(0x5b, true)] // Left Windows
    [InlineData(0xb3, true)] // Play/Pause
    [InlineData(0xaf, true)] // Volume up
    [InlineData(0x41, false)] // A
    [InlineData(0x1b, false)] // Esc
    [InlineData(0xa2, false)] // Left Ctrl
    public void MarksTheKeysWindowsSendsWithTheExtendedPrefix(int vk, bool extended)
    {
        Assert.Equal(extended, KeyboardInputServer.IsExtendedKey(vk));
    }

    [Fact]
    public void BuildsKeyboardInputsWithTheScanCodeAndUpFlag()
    {
        var key = new KeyboardInputServer.KeyEvent(0x25, 0x4b, Extended: true);
        var down = key.ToInput(keyUp: false);
        var up = key.ToInput(keyUp: true);
        Assert.Equal(1u, down.Type);
        Assert.Equal((ushort)0x25, down.Union.Keyboard.VirtualKey);
        Assert.Equal((ushort)0x4b, down.Union.Keyboard.ScanCode);
        Assert.Equal(0x0001u, down.Union.Keyboard.Flags);
        Assert.Equal(0x0003u, up.Union.Keyboard.Flags);
    }

    [Fact]
    public void LooksUpARealScanCodeForALetter()
    {
        var key = KeyboardInputServer.KeyEvent.For(0x41, IntPtr.Zero);
        Assert.NotEqual(0, key.ScanCode);
        Assert.False(key.Extended);
    }

    [Fact]
    public void MatchesTheWindowsInputLayout()
    {
        // INPUT is a DWORD type plus a union sized by MOUSEINPUT, padded for the pointer.
        Assert.Equal(Environment.Is64BitProcess ? 40 : 28, Marshal.SizeOf<KeyboardInputServer.Input>());
        Assert.Equal(Environment.Is64BitProcess ? 8 : 4, Marshal.OffsetOf<KeyboardInputServer.Input>(nameof(KeyboardInputServer.Input.Union)).ToInt32());
    }
}
