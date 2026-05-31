keytool -genkeypair -v -keystore homegroups-release-key.keystore -alias homegroups_release_alias -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore homegroups-release-key.keystore -alias your_key_alias -storepass 159753 -keypass 159753
