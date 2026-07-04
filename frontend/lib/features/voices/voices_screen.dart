import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import 'create_voice_screen.dart';
import 'voice_model.dart';

class VoicesScreen extends StatefulWidget {
  final ApiClient apiClient;
  final AudioPlayer player;
  final ValueChanged<VoiceModel> onVoiceSelected;
  final VoiceModel? selectedVoice;

  const VoicesScreen({
    super.key,
    required this.apiClient,
    required this.player,
    required this.onVoiceSelected,
    this.selectedVoice,
  });

  @override
  State<VoicesScreen> createState() => _VoicesScreenState();
}

class _VoicesScreenState extends State<VoicesScreen> {
  late Future<List<VoiceModel>> _voices;
  final _searchController = TextEditingController();
  String _query = '';
  String? _genderFilter;

  @override
  void initState() {
    super.initState();
    _voices = widget.apiClient.getVoices();
    _searchController.addListener(
      () => setState(() => _query = _searchController.text.trim().toLowerCase()),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Re-fetch the voice list from the backend (e.g. after upgrading a plan
  /// or cloning a new voice). Awaits the new future so callers like
  /// [RefreshIndicator] can keep the spinner up until it resolves.
  Future<void> _reload() async {
    final future = widget.apiClient.getVoices();
    setState(() => _voices = future);
    await future;
  }

  bool _matches(VoiceModel v) {
    if (_genderFilter != null &&
        (v.gender?.toLowerCase() != _genderFilter!.toLowerCase())) {
      return false;
    }
    if (_query.isEmpty) return true;
    return v.name.toLowerCase().contains(_query) ||
        v.description.toLowerCase().contains(_query) ||
        v.labels.values.any((l) => l.toLowerCase().contains(_query));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<VoiceModel>>(
      future: _voices,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Could not load voices.\n${snapshot.error}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.slate),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _reload,
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        }
        final all = snapshot.data!;
        final genders = all
            .map((v) => v.gender)
            .where((g) => g != null && g.trim().isNotEmpty)
            .map((g) => g!.trim().toLowerCase())
            .toSet()
            .toList()
          ..sort();

        final filtered = all.where(_matches).toList();
        final custom = filtered.where((v) => v.isCustom).toList();
        final builtIn = filtered.where((v) => !v.isCustom).toList();

        return Column(
          children: [
            _searchBar(),
            if (genders.isNotEmpty) _genderChips(genders),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _reload,
                color: AppColors.babyBlueDeep,
                child: filtered.isEmpty
                    ? ListView(
                        // AlwaysScrollable so pull-to-refresh still works
                        // even when no voices match the current search.
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          SizedBox(height: 120),
                          Center(
                            child: Text(
                              'No voices match your search.',
                              style: TextStyle(color: AppColors.slate),
                            ),
                          ),
                        ],
                      )
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                        children: [
                          _createVoiceButton(),
                          if (custom.isNotEmpty) ...[
                            _sectionHeader('My Voices'),
                            ...custom.map(_tile),
                            const SizedBox(height: 8),
                          ],
                          if (builtIn.isNotEmpty) ...[
                            _sectionHeader('Free Voices'),
                            ...builtIn.map(_tile),
                          ],
                        ],
                      ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _searchBar() => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search voices…',
                  prefixIcon:
                      const Icon(Icons.search_rounded, color: AppColors.slate),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded, size: 20),
                          onPressed: () => _searchController.clear(),
                        ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.refresh_rounded, color: AppColors.slate),
              tooltip: 'Refresh voices',
              onPressed: _reload,
            ),
          ],
        ),
      );

  Widget _genderChips(List<String> genders) => SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          children: [
            _chip('All', _genderFilter == null, () => setState(() => _genderFilter = null)),
            ...genders.map((g) => _chip(
                  _capitalize(g),
                  _genderFilter == g,
                  () => setState(() => _genderFilter = _genderFilter == g ? null : g),
                )),
          ],
        ),
      );

  Widget _chip(String label, bool selected, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) => onTap(),
          showCheckmark: false,
          backgroundColor: AppColors.surface,
          selectedColor: AppColors.babyBlue.withValues(alpha: 0.5),
          side: BorderSide(
            color: selected ? AppColors.babyBlueDeep : AppColors.outline,
          ),
          labelStyle: TextStyle(
            color: AppColors.deep,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      );

  Future<void> _openCreateVoice() async {
    final voice = await Navigator.of(context).push<VoiceModel>(
      MaterialPageRoute(
        builder: (_) => CreateVoiceScreen(
          apiClient: widget.apiClient,
          player: widget.player,
        ),
      ),
    );
    if (voice == null) return;
    // Refresh the list so the new voice shows under "My Voices", then select it.
    _reload();
    widget.onVoiceSelected(voice);
  }

  Widget _createVoiceButton() => Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 4),
        child: Material(
          color: AppColors.babyPink.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadii.field),
            onTap: _openCreateVoice,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: AppColors.babyPinkDeep.withValues(alpha: 0.5)),
              ),
              child: Row(
                children: const [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: Colors.white,
                    child: Icon(Icons.add_rounded, color: AppColors.babyPinkDeep),
                  ),
                  SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Create my voice',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.deep,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Record or upload samples to clone a voice',
                          style: TextStyle(fontSize: 13, color: AppColors.slate),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: AppColors.slate),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _sectionHeader(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: AppColors.slate,
          ),
        ),
      );

  Widget _tile(VoiceModel v) {
    final selected = widget.selectedVoice?.id == v.id;
    final subtitle = v.tagline;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? AppColors.babyBlue.withValues(alpha: 0.25) : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadii.field),
          onTap: () => widget.onVoiceSelected(v),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(
                color: selected ? AppColors.babyBlueDeep : AppColors.outline,
                width: selected ? 1.5 : 1,
              ),
            ),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: (v.isCustom ? AppColors.babyPink : AppColors.babyBlue)
                      .withValues(alpha: 0.45),
                  child: Text(
                    v.name.isNotEmpty ? v.name[0].toUpperCase() : '?',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.deep,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: AppColors.deep,
                        ),
                      ),
                      if (subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, color: AppColors.slate),
                        ),
                      ],
                    ],
                  ),
                ),
                if (selected)
                  const Icon(Icons.check_circle_rounded, color: AppColors.babyBlueDeep),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}
